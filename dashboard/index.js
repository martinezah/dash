// Defaults

var APP_ID = process.env['APP_ID'] || 'dash';
var APP_SECRET = process.env['APP_SECRET'] || 'CHANGE_ME';
var APP_PORT = parseInt(process.env['APP_PORT']) || 8088;

var KAFKA_CLIENT_ID = process.env['KAFKA_CLIENT_ID'] || 'dash';
var KAFKA_OUTGOING_TOPIC = process.env['KAFKA_OUTGOING_TOPIC'] || 'urls';

var ZOOKEEPER_SERVER = process.env['ZOOKEEPER_SERVER'] || 'localhost';

var REDIS_SERVER = process.env['REDIS_SERVER'] || 'localhost';
var REDIS_PORT = parseInt(process.env['REDIS_PORT']) || 6379;
var REDIS_TOPIC = parseInt(process.env['REDIS_TOPIC']) || 'dash-messages';

var LOCAL_TTL = parseInt(process.env['LOCAL_TTL']) || (2 * 24 * 60 * 60);
var OTHER_TTL = parseInt(process.env['OTHER_TTL']) || (2 * 60 * 60);

var LOCAL_QUEUE_SIZE = parseInt(process.env['LOCAL_QUEUE_SIZE']) || 1000;
var OTHER_QUEUE_SIZE = parseInt(process.env['OTHER_QUEUE_SIZE']) || 100;

// Bootstrap App

var express = require('express.io');
var session = require('express-session');
var redis = require('redis');
var RedisStore = require('connect-redis')(session);
var app = express();
app.http().io();

// Session Config

app.use(express.cookieParser());
app.use(express.session({
    secret: APP_SECRET,
    store: new RedisStore({
        client: redis.createClient(REDIS_PORT, REDIS_SERVER)  
    }) 
}))

// Redis Client

var publisher = redis.createClient(REDIS_PORT, REDIS_SERVER);

var subscriber = redis.createClient(REDIS_PORT, REDIS_SERVER);
subscriber.subscribe(REDIS_TOPIC)

subscriber.on('message', function(channel, message) {
    //console.log(channel, message);
    try {
        var is_local = message.appid == APP_ID;
        var queue = message.appid + ":" + message.crawlid;
        var msg = JSON.stringify(message);
        //console.log(message.appid + ":" + message.crawlid + " " + message.url);
        publisher.lpush(queue, msg);
        publisher.ltrim(queue, 0, is_local ? LOCAL_QUEUE_SIZE : OTHER_QUEUE_SIZE);
        publisher.expire(queue, is_local ? LOCAL_TTL : OTHER_TTL);
        app.io.room(queue).broadcast('message', message);
    } catch(err) {
        console.log(err);
    }
});

// Kafka Client

var kafka = require('kafka-node'),
    client = new kafka.Client(ZOOKEEPER_SERVER, KAFKA_CLIENT_ID, {});
    producer = new kafka.HighLevelProducer(client),

// Kafka Events

producer.on('ready', function (data) {
    console.log("producer: ready");
});

// Realtime Routes

app.io.route('hello', function(req) {
    //console.log('hello');
    if (!req.session.name) {
        var sessid = Math.random().toString(36).substr(2,14);
        req.session.name = sessid;
    }
    if (!req.session.crawls) {
        req.session.crawls = [];
    }
    crawls = []
    for (var ii = 0; ii < req.session.crawls.length; ii++) {
        try {
            var crawl = req.session.crawls[ii];
            var queue = crawl.appid + ":" + crawl.crawlid;
            req.io.join(queue);    
            try {
                if (!crawl.messages || !crawl.messages.length)
                    crawl.messages = [];
            } catch (err) { }
            crawls.push(crawl)
        } catch (err) { }
    }
    req.session.crawls = crawls;
    req.session.save(function() {
        req.io.emit('hello-ok', {crawls:req.session.crawls, appid: APP_ID});
    });
});

app.io.route('load', function(req) {
    for (var ii = 0; ii < req.session.crawls.length; ii++) {
        try {
            var crawl = req.session.crawls[ii];
            try {
                var queue = crawl.appid + ":" + crawl.crawlid;
                var messages = subscriber.lrange(queue, 0, -1, function(err, items) {
                    items.forEach(function (msg, i) {
                        var message = JSON.parse(msg);
                        req.io.emit('message', message);
                    });
                });
            } catch (err) { }
        } catch (err) { }
    }
});

app.io.route('add', function(req) {
    var crawl = req.data;
    console.log(crawl);
    var exists = false;
    for (var ii = 0; ii < req.session.crawls.length; ii++) {
        try {
            if (req.session.crawls[ii].appid == crawl.appid && req.session.crawls[ii].crawlid == crawl.crawlid)
                exists = true;
        } catch (err) { }
    }
    if (!exists) {
        var queue = crawl.appid + ":" + crawl.crawlid;
        req.io.join(queue);
        req.session.crawls.push(crawl);
        console.log("subscribed: " + queue);
    }
    req.session.save(function() {
        req.io.emit('add-ok', crawl);
    });
});

app.io.route('remove', function(req) {
    var crawlid = req.data.crawlid;
    var appid = req.data.appid;
    for (var ii = 0; ii < req.session.crawls.length; ii++) {
        try {
            if (req.session.crawls[ii].appid == appid && req.session.crawls[ii].crawlid == crawlid) {
                var queue = crawl.appid + ":" + crawl.crawlid;
                req.io.leave(queue);
                req.session.crawls.splice(ii,1);
                break;
            }
        } catch (err) { }
    }
    req.session.save(function() {
        req.io.emit('remove-ok', {appid:appid, crawlid:crawlid});
    });
});

app.io.route('crawl', function(req) {
    console.log('crawl requested');
    var crawldata = req.data;
    delete crawldata.messages;
    producer.send([{
        topic: KAFKA_OUTGOING_TOPIC,
        messages: [JSON.stringify(crawldata)],
    }], function (err, data) {
        console.log(data);
        var crawl = req.data;
        var exists = false;
        for (var ii = 0; ii < req.session.crawls.length; ii++) {
            if (req.session.crawls[ii].appid == crawl.appid && req.session.crawls[ii].crawlid == crawl.crawlid)
                exists = true;
        }
        if (!exists) {
            var queue = crawl.appid + ":" + crawl.crawlid;
            req.io.join(queue);
            req.session.crawls.push(crawl);
            console.log("subscribed: " + queue);
        }
        req.session.save(function() {
            req.io.emit('crawl-ok', queue);
        });
    });
});

app.io.route('goodbye', function(req) {
    delete req.session;
    req.io.emit('goodbye-ok');
});

// Redis Listener

subscriber.on('message', function(channel, message) {
    console.log('redis message: ' + channel + ' ' + message)
    app.io.room(channel).broadcast('message', message);
});

// Static Routes

var path = require('path');
app.use('/', express.static(path.join(__dirname, 'static')));

// Shutdown Cleanup

process.on('SIGINT', function () {
  subscriber.quit();
  publisher.quit();
  client.close();
});

// Connect

app.listen(APP_PORT);
console.log("Listening on " + APP_PORT);

