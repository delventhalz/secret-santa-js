#! /usr/bin/env node

const { existsSync, readFileSync, writeFileSync } = require('fs');
const munkres = require('munkres-js');
const { resolve } = require('path');


const EMAIL_PATTERN = /<?([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})>?/i;

const { SECRET_SANTA_CONFIG, SECRET_SANTA_TEST } = process.env;
const args = process.argv.slice(2);


const isEnvEmail = SECRET_SANTA_TEST === 'email';
const isEnvTest = !isEnvEmail && SECRET_SANTA_TEST && SECRET_SANTA_TEST !== 'false';

const lastTestArg = args.findLast(arg => arg.startsWith('--test'));
const isArgEmail = lastTestArg === '--test=email';
const isArgTest = !isArgEmail && lastTestArg && lastTestArg !== '--test=false';

// Command line args override environment variables
const isEmailTest = isArgEmail || (isEnvEmail && !isArgTest);
const isCommandLineTest = isEnvTest || isArgTest;

const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1]
  || args.find(arg => !arg.startsWith('-'))
  || SECRET_SANTA_CONFIG
  || 'config.json';

const config = require(`./${configPath}`);


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


console.log('Reading config files...');

const santaMap = toSantaMap(config.santas);
validateSantaMap(santaMap);
validateGroups(santaMap, config.groups);

const mainTemplate = readFile('./emails/main.txt', './emails/main.default.txt');
const listTemplate = readFile('./emails/full-list.txt', './emails/full-list.default.txt');
const conspiratorTemplate = readFile('./emails/conspirators.txt', './emails/conspirators.default.txt');


console.log('Generating Secret Santa list...');
const matches = matchSantas(santaMap, config.previousMatches, config.groups, config.count);


const sendEmail = (client, email) => {
  if (isCommandLineTest) {
    console.log('\n>>>>> TEST EMAIL SENT <<<<<');
    console.log(email);
    console.log('<<<< END OF TEST EMAIL >>>>\n');
    return;
  }

  if (isEmailTest) {
    const [_, senderName, senderDomain] = config.sender.email.match(EMAIL_PATTERN);
    const [__, recipientName] = email.to.match(EMAIL_PATTERN);

    return client.sendAsync({
      ...email,
      to: `${senderName}+${recipientName}@${senderDomain}`,
      subject: `TEST EMAIL: ${email.subject}`
    });
  }

  return client.sendAsync(email);
};

const sendEmails = async () => {
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

  await Promise.all(matches.map(([name, assignees]) => {
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
    await Promise.all(matches.map(([name, assignees]) => {
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

  if (!isCommandLineTest && !isEmailTest) {
    writeJson('./config.json', {
      ...config,
      previousMatches: [...config.previousMatches, matches]
    });
  }

  console.log('...Done!');
};

sendEmails();
