# Secret-Santa.js

A simple script to send out Secret Santa emails

## Requirements

- [Node](https://nodejs.org/)
- Ideally computer that can run bash

## Setup

```bash
git clone https://github.com/delventhalz/secret-santa-js.git
cd secret-santa-js
npm install
```

This will download the Secret Santa script and its config files, as well as the
Node module it uses to send emails.

## Config

First copy the [config.example.json](./config.example.json) file and remove the
".example" portion of the filename. This `config.json` file will be the basis
of your Secret Santa lists, including email credentials. It is gitignored and
should not be committed or shared anywhere.

After the file is copied, you should modify it with your personal details,
especially the `sender`, and `santas` properties.

### Config Properties

- `count`: The number of recipients each Santa is assigned
- `maxRetries`: How many times the script should attempt to build a valid list
  before giving up
- `sender`: Info for the person emailing out the lists
- `sender.name`: The name of the organizer as will be written in an email
- `sender.email`: The email address of the sender
- `sender.password`: The password for the email account, commonly a revocable
  "app password" generated specifically for this script
- `sender.host`: The SMTP host, for example: smtp.gmail.com
- `santas`: An array of `Santa` objects, the givers and recipients of the list
- `groups` _(optional)_: An array of arrays containing groups of names which
  must be found in the `santas` array. Commonly used for couples, members of a
  group will be handled specially relative to each other. Members of a group
  will never be assigned to each other, nor will there be any repeat
  assignments within a group.
- `previousMatches`: This array is used to prevent repeat matches from year to
  year and is populated automatically. DO NOT MODIFY IT. You may also want to
  avoid looking at it if you don't want to spoil the surprise.

### Santa Properties

Each `Santa` object within the `santas` property has properties describing that
potential santa:

- `name`: This is the name of recipient which will be written in emails. It is
  also the identifier used to identify the Santa, and so must be unique. For
  Santas with the same first name, include a last name or last initial.
- `email`: The email address to send the Secret Santa list too.
- `blocked` _(optional)_: An array of names of other Santas which _this_ Santa
  should _not_ be assigned as a recipient. This can be used instead of `groups`
  to block couples from being assigned each other.
- `always` _(optional)_: Bypasses most of the other assignment rules and just
  assigns the named Santa to this Santa directly.

## Customizing Email Text

The [emails](./emails) directory contains two `.default.txt` files, one for the
main email sent to each Santa, and one for the full list sent to the organizer
as a fallback. These templates can be used without modification, but if you want
to customize any of the text, copy the file and remove the `.default` portion of
the file name. Any changes you make to the `SUBJECT` or `BODY` sections of those
text files will be used rather than the defaults.

## Usage

Once all of your config files are in order, you are ready to run your script.
Since the file is a bash executable, you can run it directly:

```bash
./secret-santa.js
```

It can also be run with npm from within the project directory if desired.

```bash
npm start
```

Once run, the script will first validate your config files, generate a list,
and then finally email each Santa their portion of the list. The script may fail
with an error if your configuration files are missing or misformatted.

You may also see an error like this:

```
Unable to create match #2 for Santa #3: David
```

This sort of error may indicate that your config rules are too specific or
complex to generate a complete list. You may need to loosen some restrictions
in order to get it to work. You can also try increasing `maxRetries` if you are
sure a list is possible, but it takes the script more tries to find it.

### Dry Test Runs

There are two ways to test your Secret Santa config works as expected. The first
is to do a dry run entirely within the command line. This will log the data for
each email, but not send anything to anyone. This option can be specified from
the command line with the `SECRET_SANTA_TEST` environment variable, the `--test`
command line arg, or by running the `npm test` script.

```bash
SECRET_SANTA_TEST=true ./secret-santa.js
./secret-santa.js --test=true
./secret-santa.js --test
npm test
```

The second option is to do an _email_ test. This will send out every email, but
they will go to the configured sender rather than the intended recipient. To
help with debugging, the "to" field for emails sent will include the `+`
character followed by the name of the recipient. To specify this option, set the
`SECRET_SANTA_TEST` environment variable to `"email"`, use the `--test=email`
command line arg, or run the `npm run test:email` script.

```bash
SECRET_SANTA_TEST=email ./secret-santa.js
./secret-santa.js --test=email
npm run test:email
```

### Custom Config File Path

The default path for the config file is just `config.json` at the root of this
project, but if you would like to customize it, you can do so with the
`SECRET_SANTA_CONFIG` environment variable, or with command line arguments.

```bash
SECRET_SANTA_CONFIG=some/other/config.json ./secret-santa.js
./secret-santa.js some/other/config.json
./secret-santa.js --config=some/other/config.json

SECRET_SANTA_CONFIG=some/other/config.json npm start
npm start some/other/config.json
npm start -- --config=some/other/config.json
```

## Future Development

I created this for my own personal usage. I do not plan to work on it except as
I need additional features. Feel free to fork it for your own purposes!
