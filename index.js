// Defaults

var APP_ID = process.env['APP_ID'] || 'dash';
var APP_SECRET = process.env['APP_SECRET'] || 'CHANGE_ME';
var APP_PORT = parseInt(process.env['APP_PORT']) || 8088;

var KAFKA_CLIENT_ID = process.env['KAFKA_CLIENT_ID'] || 'dash';
var KAFKA_CLIENT_GROUP = process.env['KAFKA_CLIENT_GROUP'] || 'dash'; 
var KAFKA_INCOMING_TOPIC = process.env['KAFKA_INCOMING_TOPIC'] || 'crawled';
var KAFKA_OUTGOING_TOPIC = process.env['KAFKA_OUTGOING_TOPIC'] || 'urls';

var ZOOKEEPER_SERVER = process.env['ZOOKEEPER_SERVER'] || 'localhost';

var REDIS_SERVER = process.env['REDIS_SERVER'] || 'localhost';
var REDIS_PORT = parseInt(process.env['REDIS_PORT']) || 6379;

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

app.locals.redis = redis.createClient(REDIS_PORT, REDIS_SERVER);

// Kafka Client

var kafka = require('kafka-node'),
    client = new kafka.Client(ZOOKEEPER_SERVER, KAFKA_CLIENT_ID, {});
    producer = new kafka.HighLevelProducer(client),
    consumer = new kafka.HighLevelConsumer(client, [{topic:KAFKA_INCOMING_TOPIC}], { 
        groupId: KAFKA_CLIENT_GROUP, 
    });

// Kafka Events

producer.on('ready', function (data) {
    //console.log("producer: ready");
});

consumer.on('offsetOutOfRange', function (data) {
    //console.log("consumer: offsetOutOfRange");
});

consumer.on('error', function (data) {
    //console.log("consumer: error");
});

consumer.on('message', function(data) {
    //console.log("consumer: message");
    try {
        var message = JSON.parse(data.value);
        console.log(message.appid + ":" + message.crawlid + " " + message.url);
        message.body = null;
        delete message.body;
        var is_local = message.appid == APP_ID;
        var queue = message.appid + ":" + message.crawlid;
        var msg = JSON.stringify(message);
        app.locals.redis.lpush(queue, msg);
        app.locals.redis.ltrim(queue, 0, is_local ? LOCAL_QUEUE_SIZE : OTHER_QUEUE_SIZE);
        app.locals.redis.expire(queue, is_local ? LOCAL_TTL : OTHER_TTL);
        app.io.room(message.crawlid).broadcast('message', message);
    } catch(err) {
        console.log(err);
    }
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
            req.io.join(crawl.crawlid);    
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
                var messages = app.locals.redis.lrange(queue, 0, -1, function(err, items) {
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
    var exists = false;
    for (var ii = 0; ii < req.session.crawls.length; ii++) {
        try {
            if (req.session.crawls[ii].crawlid == crawl.crawlid)
                exists = true;
        } catch (err) { }
    }
    if (!exists) {
        req.io.join(crawl.crawlid);
        req.session.crawls.push(crawl);
    }
    req.session.save(function() {
        req.io.emit('add-ok', crawl);
    });
});

app.io.route('remove', function(req) {
    var crawlid = req.data.crawlid;
    for (var ii = 0; ii < req.session.crawls.length; ii++) {
        try {
            if (req.session.crawls[ii].crawlid == crawlid) {
                req.io.leave(crawlid);
                req.session.crawls.splice(ii,1);
                break;
            }
        } catch (err) { }
    }
    req.session.save(function() {
        req.io.emit('remove-ok', {crawlid:crawlid});
    });
});

app.io.route('crawl', function(req) {
    //console.log('crawl requested');
    producer.send([{
        topic: KAFKA_OUTGOING_TOPIC,
        messages: [JSON.stringify(req.data)],
    }], function (err, data) {
        //console.log(data);
        var crawl = req.data;
        var exists = false;
        for (var ii = 0; ii < req.session.crawls.length; ii++) {
            if (req.session.crawls[ii].crawlid == crawl.crawlid)
                exists = true;
        }
        if (!exists) {
            req.io.join(crawl.crawlid);
            req.session.crawls.push(crawl);
        }
        req.session.save(function() {
            req.io.emit('crawl-ok', crawl);
        });
    });
});

app.io.route('goodbye', function(req) {
    delete req.session;
    req.io.emit('goodbye-ok');
});

// Static Routes

var path = require('path');
app.use('/', express.static(path.join(__dirname, 'static')));

// Shutdown Cleanup

process.on('SIGINT', function () {
  app.locals.redis.quit();
  consumer.close(true, function(){
    client.close();
  });
});

// Connect

app.listen(APP_PORT);
console.log("Listening on " + APP_PORT);

