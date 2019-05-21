import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import morgan from 'morgan';
import botkit from 'botkit';
import dotenv from 'dotenv';
import yelp from 'yelp-fusion';

dotenv.config({ silent: true });

// initialize
const app = express();

// enable/disable cross origin resource sharing if necessary
app.use(cors());

// enable/disable http request logging
app.use(morgan('dev'));

// enable only if you want templating
app.set('view engine', 'ejs');

// enable only if you want static assets from folder static
app.use(express.static('static'));

// this just allows us to render ejs from the ../app/views directory
app.set('views', path.join(__dirname, '../src/views'));

// enable json message body for posting data to API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// default index route
app.get('/', (req, res) => {
  res.send('hi');
});

// botkit controller
const controller = botkit.slackbot({
  debug: true,
});

// initialize slackbot
const slackbot = controller.spawn({
  token: process.env.SLACK_BOT_TOKEN,
  // this grabs the slack token we exported earlier
}).startRTM((err) => {
  // start the real time message client
  if (err) { throw new Error(err); }
});

// prepare webhook
// for now we won't use this but feel free to look up slack webhooks
controller.setupWebserver(process.env.PORT || 3001, (err, webserver) => {
  controller.createWebhookEndpoints(webserver, slackbot, () => {
    if (err) { throw new Error(err); }
  });
});

// outgoing webhook
controller.on('outgoing_webhook', (bot, message) => {
  bot.replyPublic(message, 'yeah yeah, old-town-bot is here partner');
});

// direct message replies
controller.on('direct_message', (bot, message) => {
  bot.reply(message, 'Yeehaw partner');
});

// example hello response
controller.hears(['hello', 'hi', 'howdy'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    if (res) {
      bot.reply(message, `Howdy, ${res.user.name}!`);
    } else {
      bot.reply(message, 'Howdy partner!');
    }
  });
});

// help call
controller.hears(['help'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    bot.reply(message, 'Howdy cowboy!\n Here are some commands to get you started:\n hello - exchange greetings\nhungry - restraunt query\nfavorite song - I will show you my favorite song\nsing - I will sing you a song\nduel - we duel each other on the old town road');
  });
});

// sing call
controller.hears(['sing'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    bot.reply(message, 'If you will allow me, mhmm\nYeah, I\'m gonna take my horse to the old town road\n I\'m gonna ride \'til I can\'t no more\n I\'m gonna take my horse to the old town road\n I\'m gonna ride \'til I can\'t no more');
  });
});

// favorite song call
controller.hears(['favorite song'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    const result = {
      attachments: [
        {
          fallback: 'no result',
          title: 'Old Town Road - Lil Nas X',
          title_link: 'https://www.youtube.com/watch?v=w2Ov5jzm3j8',
          image_url: 'https://i.ytimg.com/vi/7ysFgElQtjI/maxresdefault.jpg',
        },
      ],
    };
    bot.reply(message, result);
  });
});

// duel call
controller.hears(['duel'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    bot.reply(message, 'It\'s high noon...');
    bot.startConversation(message, duelStart);
  });
});

function duelStart(message, bot) {
  bot.ask('You sure you want to duel partner?', (mes, res) => {
    if (mes.text === 'no' || mes.text === 'nah') {
      bot.say('Wise choice...');
      bot.next();
    } else {
      startDraw(message, bot);
      bot.next();
    }
  });
}

function startDraw(message, bot) {
  bot.ask('old-town-bot looks at you in the eyes as the clock ticks closer to noon, then you hear the bell tolls. Do you draw?', (mes, res) => {
    if (mes.text === 'no' || mes.text === 'nah') {
      bot.say('BAM! You are shot dead by old-town-bot. Long live the bots!');
      bot.next();
    } else {
      bot.say('BAM! You shot old-town-bot but another replaces it :)');
      bot.next();
    }
  });
}

// restraunt query
controller.hears(['hungry', 'food', 'restraunt'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    bot.reply(message, 'Howdy there partner!');
    bot.startConversation(message, yelpSearch);
  });
});

let location;
let food;

function yelpSearch(message, bot) {
  bot.ask('Want some food recommendation?', (mes, res) => {
    if (mes.text === 'no' || mes.text === 'nah') {
      bot.say('Oh well, maybe next time!');
      bot.next();
    } else {
      findFood(message, bot);
      bot.next();
    }
  });
}

function findFood(message, bot) {
  bot.ask('What kind of food you feeling?', (mes, res) => {
    food = mes.text;
    findLocation(message, bot);
    bot.next();
  });
}

function findLocation(message, bot) {
  bot.ask('What is your address?', (mes, res) => {
    location = mes.text;
    executeSearch(food, location, bot);
    bot.next();
  });
}

// use the yelp client
function executeSearch(foodInput, locationInput, bot) {
  const yelpClient = yelp.client(process.env.YELP_API_KEY);
  bot.say('Yeewhaw, here are some food for you cowboy');
  yelpClient.search({
    term: foodInput,
    location: locationInput,
  }).then((response) => {
    if (response.jsonBody.businesses.length < 1) {
      bot.say('Did not find anything :(');
      bot.next();
    }
    response.jsonBody.businesses.forEach((business) => {
      const result = {
        attachments: [
          {
            fallback: 'no result',
            pretext: `Rating: ${business.rating}`,
            title: business.name,
            title_link: business.url,
            image_url: business.image_url,
          },
        ],
      };
      bot.say(result);
      bot.next();
    });
  }).catch((error) => {
    console.log(error);
    bot.say('Sorry, service not available right now!');
    bot.next();
  });
}


// START THE SERVER
// =============================================================================
const port = process.env.PORT || 9090;
app.listen(port);

console.log(`listening on: ${port}`);
