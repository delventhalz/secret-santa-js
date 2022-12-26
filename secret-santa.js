#! /usr/bin/env node

const config = require('./config.json');

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const randInt = max => Math.floor(Math.random() * max);

const shuffle = (items) => {
  const source = items.slice();
  const shuffled = [];

  while (source.length > 0) {
    const index = randInt(source.length);
    shuffled.push(...source.splice(index, 1));
  }

  return shuffled;
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

const matchSantas = (santaMap, allGroups, maxCount) => {
  const santas = shuffle([...santaMap.values()]);
  const santaNames = [...santaMap.keys()];
  const matchCounts = Object.fromEntries(santaNames.map(name => [name, 0]));
  const allMatches = [];

  for (const { name, email, blocked = [], always = [] } of santas) {
    const remainingAlways = [...always];

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
const retryMatchSantas = (santaMap, allGroups, maxCount, maxRetries) => {
  let attempts = 0;

  while (true) {
    try {
      return matchSantas(santaMap, allGroups, maxCount);
    } catch (err) {
      if (attempts < maxRetries) {
        attempts += 1;
      } else {
        throw err;
      }
    }
  }
};

const santaMap = toSantaMap(config.santas);

validateSantaMap(santaMap);
validateGroups(santaMap, config.groups);

const matches = retryMatchSantas(santaMap, config.groups, config.count, config.maxRetries);

console.log(matches);
