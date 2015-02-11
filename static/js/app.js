var socket = io.connect();

var online = false;

socket.on('hello-ok', function() {
    online = true;
});

socket.on('add-ok', function(data) {
    console.log(data);
});

socket.on('remove-ok', function(data) {
    console.log(data);
});

socket.emit('hello');
setTimeout(function() { socket.emit('add', {crawlid:"foo"}); }, 100);
setTimeout(function() { socket.emit('add', {crawlid:"foober"}); }, 400);
setTimeout(function() { socket.emit('remove', {crawlid:"foober"}); }, 1000);
