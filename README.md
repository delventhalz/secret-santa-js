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
modules it uses to generate assignments and send emails.

## Config

First copy the [config.example.json](./config.example.json) file and remove the
".example" portion of the filename. This `config.json` file will be the basis
of your Secret Santa lists, including email credentials. It is gitignored and
should not be committed or shared anywhere.

After the file is copied, you should modify it with your personal details,
especially the `sender`, and `santas` properties.

### Config Properties

- `count`: The number of recipients each Santa is assigned
- `notifyConspirators`: If set to `true`, sends a second email to each Santa
  with the names of other Santas which share the same assignee
- `sender`: Info for the person emailing out the lists
- `sender.name`: The name of the organizer as will be written in an email
- `sender.email`: The email address of the sender
- `sender.password`: The password for the email account, commonly a revocable
  "app password" generated specifically for this script
- `sender.host`: The SMTP host, for example: smtp.gmail.com
- `santas`: An array of `Santa` objects, the givers and recipients of the list
- `groups` _(optional)_: An array of arrays containing groups of names which
  must be found in the `santas` array. Commonly used for couples, members of a
  group will be handled specially relative to each other. They will generally
  not be assigned to each other, nor be assigned the same people, and not be
  assigned _to_ the same people.
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
  should _not_ be assigned as a recipient.
- `always` _(optional)_: The opposite of blocked, these are names which _should_
  be assigned to this Santa if possible.

## Customizing Email Text

The [emails](./emails) directory contains three `.default.txt` files as
fallbacks: one for the main email sent to each Santa, one for the full list sent
to the organizer, and one for notify conspirators of each other's names. These
templates can be used without modification, but if you want to customize any of
the text, copy the file and remove the `.default` portion of the file name. Any
changes you make to the `SUBJECT` or `BODY` sections of those text files will be
used rather than the defaults.

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

If you notice sub-optimal outcomes, for example Santas getting the same
assignments as last year or being assigned people on their blocked list, it is
likely your config doesn't have enough Santas or is too specific to make a more
optimal match. You can try tweaking your file and trying again.

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

### Sending A Reminder Email

If you want to remind folks of their assignments, you can send an email to all
Santas with the their same assignments from their most recent match in
`previousMatches` in your config file. This is a good way to remind folks
without spoiling the surprise by manually checking your most recent reminders.
Send a reminder email by setting the environment variable
`SECRET_SANTA_REMINDER` to true, calling the script with the `--reminder` flag,
or by running the `npm run reminder` script.

```bash
SECRET_SANTA_REMINDER=true ./secret-santa.js
./secret-santa.js --reminder=true
./secret-santa.js --reminder
npm run reminder
```

You can also combine this with the test options to test a reminder email.

```bash
SECRET_SANTA_TEST=true SECRET_SANTA_REMINDER=true ./secret-santa.js
./secret-santa.js --test=email --reminder=true
./secret-santa.js --test --reminder
npm test -- --reminder
```

## Future Development

I created this for my own personal usage. I do not plan to work on it except as
I need additional features. Feel free to fork it for your own purposes!
