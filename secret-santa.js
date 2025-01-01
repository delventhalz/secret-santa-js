const { existsSync, readFileSync, writeFileSync } = require('fs');
const munkres = require('munkres-js');
const { resolve } = require('path');


const EMAIL_PATTERN = /<?([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})>?/i;

const {
  SECRET_SANTA_CONFIG,
  SECRET_SANTA_TEST,
  npm_config_config,
  npm_config_test,
  npm_config_reminder,
  npm_config_remove
} = process.env;


// Command line args override environment variables
const configPath = npm_config_config || SECRET_SANTA_CONFIG || 'config.json';
const config = require(`./${configPath}`);

const testSetting = npm_config_test || SECRET_SANTA_TEST;
const isEmailTest = testSetting === 'email';
const isCommandLineTest = !isEmailTest && Boolean(testSetting) && testSetting !== 'false';

const isReminderEmail = Boolean(npm_config_reminder) && npm_config_reminder !== 'false';
const santaToRemove = npm_config_remove;

const subjectPrefix = isReminderEmail
  ? 'REMINDER: '
  : santaToRemove
  ? 'UPDATE: '
  : '';

const randInt = max => Math.floor(Math.random() * max);

const readJson = (path, defaultVal) => existsSync(path) ? require(path) : defaultVal;

const writeJson = (path, data) => {
  writeFileSync(resolve(__dirname, path), JSON.stringify(data, null, 2));
};

const readFile = (customPath, defaultPath) => {
  const customResolved = resolve(__dirname, customPath);
  const path = existsSync(customResolved) ? customResolved : resolve(__dirname, defaultPath);

  return readFileSync(path, 'utf8');
};

const getUpcomingChristmasYear = () => {
  const now = new Date();

  // All date values are local
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // getMonth is zero-based
  const day = now.getDate();

  if (month === 12 && day > 24) {
    return year + 1;
  }

  return year;
};

const parseEmail = (template, substitutions) => {
  let email = template;

  for (const [key, val] of Object.entries(substitutions)) {
    const sub = Array.isArray(val) ? `  - ${val.join('\n  - ')}\n` : val;
    email = email.replace(new RegExp(`{{${key}}}`, 'g'), sub);
  }

  const [_, subject, body] = email.match(/SUBJECT:([\s\S]*)BODY:([\s\S]*)/);

  return {
    subject: subject.trim(),
    body: body.trim()
  };
};


const toSantaMap = (santas) => {
  const map = new Map();

  for (const santa of santas) {
    if (map.has(santa.name)) {
      throw new Error(`Santa name is not unique: ${santa.name}`);
    }

    map.set(santa.name, santa);
  }

  return map;
};

const validateSantaMap = (santaMap) => {
  for (const { email, blocked = [], always = [] } of santaMap.values()) {
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }

    for (const blockedName of blocked) {
      if (!santaMap.has(blockedName)) {
        throw new Error(`Cannot find blocked name: ${blockedName}`);
      }
    }

    for (const alwaysName of always) {
      if (!santaMap.has(alwaysName)) {
        throw new Error(`Cannot find always name: ${alwaysName}`);
      }
    }
  }
};

const validateGroups = (santaMap, groups) => {
  for (const group of groups) {
    for (const name of group) {
      if (!santaMap.has(name)) {
        throw new Error(`Cannot find group name: ${name}`);
      }
    }
  }
};

const validateSantaToRemove = () => {
  if (santaToRemove) {
    if (isReminderEmail) {
      throw new Error('Cannot remove a Santa in a reminder email');
    }

    if (config.previousMatches.at(-1).every(([name]) => name !== santaToRemove)) {
      throw new Error(`Cannot remove Santa not in most recent matches: ${santaToRemove}`);
    }
  }
}

const nameToContact = (santaMap, name) => `${name} <${santaMap.get(name).email}>`;


// Generate an array of assignment scores for a particular santa, lower is better
const scoreSantaMatches = (santa, currentMatches, previousMatches, allGroups) => {
  const santaGroups = allGroups.filter(group => group.includes(santa.name));
  const santaGroupMates = santaGroups.flat().filter(name => name !== santa.name);

  const alreadyMatched = currentMatches.find(([name]) => name === santa.name)[1];
  const alreadyMatchedGroup = alreadyMatched
    .flatMap(name => allGroups.filter(group => group.includes(name)).flat())
    .filter(name => !alreadyMatched.includes(name));

  const groupMatched = currentMatches
    .filter(([name]) => santaGroupMates.includes(name))
    .map(([_, matches]) => matches)
    .flat();
  const matchedSanta = currentMatches
    .filter(([_, matches]) => matches.includes(santa.name))
    .map(([name]) => name);
  const santaPreviousMatches = previousMatches
    .map(prev => prev.find(([name]) => name === santa.name))
    .filter(Boolean)
    .map(([_, matches]) => matches);
  const unmatchedAlways = santa.always
    ?.filter(name => !alreadyMatched.includes(name))
    ?? [];

  const santaCount = currentMatches.length;
  const prevMatchCount = santaPreviousMatches.length;

  return currentMatches.map(([assignee]) => {
    let score = 0;

    // Random tie breaker
    score += Math.ceil(Math.random() * santaCount ** 2);

    // Previous matches with this assignee in increasing importance
    santaPreviousMatches.forEach((matches, index) => {
      if (matches.includes(assignee)) {
        score += santaCount ** (index + 3);
      }
    });

    // Assignee is in a group with someone already matched with the santa
    if (alreadyMatchedGroup.includes(assignee)) {
      score += santaCount ** (prevMatchCount + 3);
    }

    // Assignee matched to someone in the santa's group
    if (groupMatched.includes(assignee)) {
      score += santaCount ** (prevMatchCount + 4);
    }

    // Assignee has already had the santa matched to them
    if (matchedSanta.includes(assignee)) {
      score += santaCount ** (prevMatchCount + 5);
    }

    // Assignee is in the santa's group
    if (santaGroupMates.includes(assignee)) {
      score += santaCount ** (prevMatchCount + 6);
    }

    // Assignee is blocked by the santa
    if (santa.blocked?.includes(assignee)) {
      score += santaCount ** (prevMatchCount + 7);
    }

    // Assignee is in santa's always list but has not already been matched
    // (Improves score by reducing it)
    if (unmatchedAlways.includes(assignee)) {
      score -= santaCount ** (prevMatchCount + 8);
    }

    // Santa has already been matched with assignee
    if (alreadyMatched.includes(assignee)) {
      score += santaCount ** (prevMatchCount + 9);
    }

    // Santa is assignee
    if (santa.name === assignee) {
      score += santaCount ** (prevMatchCount + 10);
    }

    return score;
  })
};

const matchSantas = (santaMap, previousMatches, allGroups, maxCount) => {
  const santas = [...santaMap.values()];
  const santaNames = [...santaMap.keys()];
  const matches = santaNames.map(name => [name, []]);

  for (let i = 0; i < maxCount; i += 1) {
    const scores = santas.map((santa) => {
      return scoreSantaMatches(santa, matches, previousMatches, allGroups);
    });

    // Assign santas based on a matrix of scores, lower is better
    const assignments = munkres(scores);

    for (const [santaIndex, assigneeIndex] of assignments) {
      matches[santaIndex][1].push(santaNames[assigneeIndex]);
    }
  }

  return matches;
};

const removeSantaFromLastMatches = (santa, santaMap) => {
  const lastMatches = config.previousMatches.at(-1);
  const olderMatches = config.previousMatches.slice(0, -1);

  const brokenMatches = lastMatches.filter(([_, matches]) => matches.includes(santa));
  const brokenSantas = brokenMatches.map(([name]) => name);
  const [_, brokenAssignees] = lastMatches.find(([name]) => name === santa);
  const brokenAssigneesAsMatches = brokenAssignees.map(assignee => [assignee, []]);

  const scores = brokenSantas.map(santa => {
    const santaObj = santaMap.get(santa);
    const matches = [[santa, []], ...brokenAssigneesAsMatches];
    return scoreSantaMatches(santaObj, matches, olderMatches, config.groups);
  });

  const assignments = munkres(scores.map(perSanta => perSanta.slice(1)));

  const updates = assignments.map(([santaIndex, assigneeIndex]) => {
    const [name, assignees] = brokenMatches[santaIndex];
    const updated = [
      ...assignees.filter(assignee => assignee !== santa),
      brokenAssignees[assigneeIndex]
    ];

    return [name, updated];
  });

  const updatedMatches = lastMatches
    .filter(([name]) => name !== santa)
    .map(match => updates.find(([name]) => match[0] === name) ?? match);

  return [updatedMatches, brokenSantas];
};

const writePreviousMatches = (previousMatches) => {
  if (!isCommandLineTest && !isEmailTest && !isReminderEmail) {
    writeJson(configPath, { ...config, previousMatches });
  }
};

console.log('Reading config files...');

const santaMap = toSantaMap(config.santas);
validateSantaMap(santaMap);
validateGroups(santaMap, config.groups);
validateSantaToRemove();

const mainTemplate = readFile('./emails/main.txt', './emails/main.default.txt');
const listTemplate = readFile('./emails/full-list.txt', './emails/full-list.default.txt');
const conspiratorTemplate = readFile('./emails/conspirators.txt', './emails/conspirators.default.txt');


const sendEmail = (client, email) => {
  const withSubjectPrefix = {
    ...email,
    subject: subjectPrefix + email.subject
  };

  if (isCommandLineTest) {
    console.log('\n>>>>> TEST EMAIL SENT <<<<<');
    console.log(withSubjectPrefix);
    console.log('<<<< END OF TEST EMAIL >>>>\n');
    return;
  }

  if (isEmailTest) {
    const [_, senderName, senderDomain] = config.sender.email.match(EMAIL_PATTERN);
    const [__, recipientName] = email.to.match(EMAIL_PATTERN);

    return client.sendAsync({
      ...withSubjectPrefix,
      to: `${senderName}+${recipientName}@${senderDomain}`,
      subject: `[TEST EMAIL] ${withSubjectPrefix.subject}`
    });
  }

  return client.sendAsync(withSubjectPrefix);
};

const sendEmails = async (matches, updateList = null) => {
  console.log('Sending emails...');

  let smtpClient = null;

  if (!isCommandLineTest) {
    const { SMTPClient } = await import('emailjs');
    smtpClient = new SMTPClient({
      user: config.sender.email,
      password: config.sender.password,
      host: config.sender.host,
      ssl: true
    });
  }

  const year = getUpcomingChristmasYear();

  const listEmail = parseEmail(listTemplate, {
    year,
    matches: matches.map(([name, assignees]) => {
      return `${nameToContact(santaMap, name)}: ${assignees.join(', ')}`;
    })
  });

  await sendEmail(smtpClient, {
    to: `${config.sender.name} <${config.sender.email}>`,
    from: `Secret Santa <${config.sender.email}>`,
    subject: listEmail.subject,
    text: listEmail.body
  });

  const matchRecipients = updateList
    ? matches.filter(([name]) => updateList.includes(name))
    : matches;

  await Promise.all(matchRecipients.map(([name, assignees]) => {
    const mainEmail = parseEmail(mainTemplate, {
      name,
      assignees,
      year,
      organizer: config.sender.name
    });

    return sendEmail(smtpClient, {
      to: nameToContact(santaMap, name),
      from: `Secret Santa <${config.sender.email}>`,
      subject: mainEmail.subject,
      text: mainEmail.body
    });
  }));

  if (config.notifyConspirators) {
    await Promise.all(matchRecipients.map(([name, assignees]) => {
      const conspirators = assignees.map(consp => {
        return matches
          .filter(([match]) => match !== name)
          .filter(([_, matchAssignees]) => matchAssignees.includes(consp))
          .map(([match]) => `${nameToContact(santaMap, match)}: ${consp}`);
      });

      const conspiratorEmail = parseEmail(conspiratorTemplate, {
        name,
        year,
        conspirators
      });

      return sendEmail(smtpClient, {
        to: nameToContact(santaMap, name),
        from: `Secret Santa <${config.sender.email}>`,
        subject: conspiratorEmail.subject,
        text: conspiratorEmail.body
      });
    }));
  }
};


if (santaToRemove) {
  console.log(`Removing ${santaToRemove} from previous Secret Santa list...`);
  const [updatedMatches, updateList] = removeSantaFromLastMatches(santaToRemove, santaMap);
  sendEmails(updatedMatches, updateList).then(() => {
    writePreviousMatches([...config.previousMatches.slice(0, -1), updatedMatches]);
    console.log('...Done!');
  });
} else if (isReminderEmail) {
  console.log('Fetching previous Secret Santa list...');
  sendEmails(config.previousMatches.at(-1));
  console.log('...Done!');
} else {
  console.log('Generating Secret Santa list...');
  const matches = matchSantas(santaMap, config.previousMatches, config.groups, config.count);
  sendEmails(matches).then(() => {
    writePreviousMatches([...config.previousMatches, matches]);
    console.log('...Done!');
  });
}
