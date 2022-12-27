#! /usr/bin/env node

const { existsSync, readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');
const config = require('./config.json');


const PREVIOUS_PATH = './previous-matches.json';
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;


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


const matchSantas = (santaMap, previousMatches, allGroups, maxCount) => {
  const santaNames = [...santaMap.keys()];
  const matchCounts = Object.fromEntries(santaNames.map(name => [name, 0]));
  const allMatches = [];

  for (const { name, email, blocked = [], always = [] } of santaMap.values()) {
    const remainingAlways = [...always];

    const previousNames = previousMatches
      .filter(([matcher]) => matcher === name)
      .map(([_, __, matches]) => matches)
      .flat();

    const groupNames = allGroups
      .filter(group => group.includes(name))
      .flat();

    const groupMatches = allMatches
      .filter(([matcher]) => groupNames.includes(matcher))
      .map(([_, __, matches]) => matches)
      .flat();

    let options = santaNames.filter(option => {
      return (
        option !== name
        && !blocked.includes(option)
        && !always.includes(option)
        && !previousNames.includes(option)
        && !groupNames.includes(option)
        && !groupMatches.includes(option)
        && matchCounts[option] < maxCount
      );
    });

    const matches = [];

    while (matches.length < maxCount) {
      let match;

      if (remainingAlways.length > 0) {
        match = remainingAlways.pop();
      } else {
        match = options[randInt(options.length)];
      }

      if (!match) {
        const matchNum = matches.length + 1;
        const santaNum = allMatches.length + 1;
        throw new Error(`Unable to create match #${matchNum} for santa #${santaNum}: ${name}`);
      }

      const toRemove = allGroups.filter(group => group.includes(match)).flat();
      options = options.filter(option => !toRemove.includes(option));

      matchCounts[match] += 1;
      matches.push(match);
    }

    allMatches.push([name, email, matches]);
  }

  return allMatches;
};

// Probably a more elegant way to do this than just a bunch of retries...
const retryMatchSantas = (santaMap, previousMatches, allGroups, maxCount, maxRetries) => {
  let attempts = 0;

  while (true) {
    try {
      return matchSantas(santaMap, previousMatches, allGroups, maxCount);
    } catch (err) {
      if (attempts < maxRetries) {
        attempts += 1;
      } else {
        throw err;
      }
    }
  }
};

console.log('Generating Secret Santa list...');

const santaMap = toSantaMap(config.santas);
validateSantaMap(santaMap);
validateGroups(santaMap, config.groups);

const mainTemplate = readFile('./emails/main.txt', './emails/main.default.txt');
const listTemplate = readFile('./emails/full-list.txt', './emails/full-list.default.txt');

const matches = retryMatchSantas(
  santaMap,
  readJson(PREVIOUS_PATH, []),
  config.groups,
  config.count,
  config.maxRetries
);

console.log('Sending emails...');

import('emailjs')
  .then(({ SMTPClient }) => {
    const smtpClient = new SMTPClient({
      user: config.sender.email,
      password: config.sender.password,
      host: config.sender.host,
      ssl: true
    });

    const matchesList = matches.map(([name, email, assignees]) => {
      return `${name} <${email}>: ${assignees.join(', ')}`;
    });
    const listEmail = parseEmail(listTemplate, {
      matches: matchesList
    });
    const listPromise = smtpClient.sendAsync({
      to: `${config.sender.name} <${config.sender.email}>`,
      from: `Secret Santa <${config.sender.email}>`,
      subject: listEmail.subject,
      text: listEmail.body
    });

    const matchPromises = matches.map(([name, email, assignees]) => {
      const mainEmail = parseEmail(mainTemplate, {
        name,
        assignees,
        organizer: config.sender.name
      });

      return smtpClient.sendAsync({
        to: `${name} <${email}>`,
        from: `Secret Santa <${config.sender.email}>`,
        subject: mainEmail.subject,
        text: mainEmail.body
      });
    });

    return Promise.all([...matchPromises, listPromise]);
  })
  .then(() => {
    writeJson(PREVIOUS_PATH, matches);
    console.log('...Secret Santa list generated and distributed!');
  });
