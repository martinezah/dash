// Defaults

var ZOOKEEPER_SERVER = 'localhost';
var KAFKA_CLIENT_ID = 'ist-dash';
var KAFKA_CLIENT_GROUP = 'ist-dash-dev'; // + Math.random().toString(36).substr(2,14);
var KAFKA_INCOMING_TOPIC = 'memex.crawled_firehose';
var KAFKA_OUTGOING_TOPIC = 'memex.incoming_urls';

var APP_PORT = 8088;
var APP_SECRET = 'n53FXVBYULeuV26LkZpaSM4k';

// Bootstrap app
var express = require('express.io');
var session = require('express-session');
var redis = require('redis');
var RedisStore = require('connect-redis')(session);
var app = express();
app.http().io();

// Set up sessions
app.use(express.cookieParser());
app.use(express.session({
    secret: APP_SECRET,
    store: new RedisStore({
        client: redis.createClient()  
    }) 
}))

/*
app.io.set('store', new express.io.RedisStore({
    redisPub: redis.createClient(),
    redisSub: redis.createClient(),
    redisClient: redis.createClient(),
}))
*/

// Set up Kafka client
var kafka = require('kafka-node'),
    client = new kafka.Client(ZOOKEEPER_SERVER, KAFKA_CLIENT_ID, {});
    producer = new kafka.HighLevelProducer(client),
    consumer = new kafka.HighLevelConsumer(client, [{topic:KAFKA_INCOMING_TOPIC}], { 
        groupId: KAFKA_CLIENT_GROUP, 
    });

// Realtime routes

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
        console.log(message.crawlid + " " + message.url);
        app.io.room(message.crawlid).broadcast('message', message);
    } catch(err) {
        console.log(err);
    }
});

// Set up realtime routes
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
            req.io.join(req.session.crawls[ii].crawlid);    
            crawls.push(req.session.crawls[ii])
        } catch (err) { }
    }
    req.session.crawls = crawls;
    req.session.save(function() {
        req.io.emit('hello-ok', {crawls:req.session.crawls});
    });
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
    console.log('crawl requested');
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

// Static routes
var path = require('path');
app.use('/', express.static(path.join(__dirname, 'static')));

// Shutdown
process.on('SIGINT', function () {
  consumer.close(true, function(){
    client.close();
  });
});

// Connect
app.listen(APP_PORT);
console.log("Listening on " + APP_PORT);

