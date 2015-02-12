var express = require('express.io');
var app = express();
app.http().io();

// Set up sessions
app.use(express.cookieParser());
app.use(express.session({secret: 'n53FXVBYULeuV26LkZpaSM4k'}));

// Set up Kafka client
var KAFKA_SERVER = 'k01.istresearch.com:2191';
var KAFKA_CLIENT_GROUP = 'ist-dash';
var KAFKA_TOPIC = 'memex.crawled_firehose'
var kafka = require('kafka-node'),
    client = new kafka.Client(KAFKA_SERVER),
    producer = new kafka.Producer(client),
    consumer = new kafka.Consumer(client, [{topic:KAFKA_TOPIC}], {
        groupId: KAFKA_CLIENT_GROUP,
        autoCommitIntervalMs: 500,
    });

producer.on('ready', function () {
    console.log("ready");
});

consumer.on('message', function(data) {
    console.log(data);
});

// Set up static routes
var path = require('path');
app.use('/', express.static(path.join(__dirname, 'static')));

// Set up realtime routes
app.io.route('hello', function(req) {
    var sessid = Math.random().toString(36).substr(2,14);
    req.session.name = sessid;
    req.session.crawls = {};
    req.session.save(function() {
        req.io.emit('hello-ok');
    });
});

app.io.route('add', function(req) {
    var crawlid = req.data.crawlid;
    req.session.crawls[crawlid] = 1;
    req.session.save(function() {
        req.io.emit('add-ok', {crawls:req.session.crawls});
    });
});

app.io.route('remove', function(req) {
    var crawlid = req.data.crawlid;
    delete req.session.crawls[crawlid];
    req.session.save(function() {
        req.io.emit('add-ok', {crawls:req.session.crawls});
    });
});

app.io.route('crawl', function(req) {
    req.session.save(function() {
        req.io.emit('crawl-notimpl');
    });
});

app.io.route('goodbye', function(req) {
    delete req.session;
    req.io.emit('goodbye-ok');
});

// Connect
app.listen(8088);
