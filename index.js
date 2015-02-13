// Defaults

var ZOOKEEPER_SERVER = 'z03.istresearch.com';
var KAFKA_CLIENT_ID = 'ist-dash';
var KAFKA_CLIENT_GROUP = 'ist-dash-dev'; // + Math.random().toString(36).substr(2,14);
var KAFKA_INCOMING_TOPIC = 'memex.crawled_firehose';
var KAFKA_OUTGOING_TOPIC = 'memex.incoming_urls';

var APP_PORT = 8081;
var APP_SECRET = 'n53FXVBYULeuV26LkZpaSM4k';

// Bootstrap app
var express = require('express.io');
var app = express();
app.http().io();

// Set up sessions
app.use(express.cookieParser());
app.use(express.session({secret: APP_SECRET}));

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
        socket.to(message.crawlid).emit('message', message);
    } catch(err) {
        console.log(err);
    }
});

// Set up realtime routes
app.io.route('hello', function(req) {
    //console.log('hello');
    var sessid = Math.random().toString(36).substr(2,14);
    req.session.name = sessid;
    req.session.save(function() {
        req.io.emit('hello-ok');
    });
});

app.io.route('add', function(req) {
    var crawlid = req.data.crawlid;
    req.io.join(crawlid);
    req.session.save(function() {
        req.io.emit('add-ok', {crawlid:crawlid});
    });
});

app.io.route('remove', function(req) {
    var crawlid = req.data.crawlid;
    req.io.leave(crawlid);
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
        var crawlid = req.data.crawlid;
        req.io.join(crawlid);
        req.session.save(function() {
            req.io.emit('crawl-ok', req.data);
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

