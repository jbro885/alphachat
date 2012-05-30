var App = new AppView;

var socket = io.connect();

App.on('vote', function(player) {
  console.log('toplevel got vote', player);
  socket.emit('vote', player.attributes);
});

socket.on('error', function(d) { alert('error'); console.log('error', d); });

socket.on('connect', function(client) {
  App.connect();
});

socket.on('disconnect', function() {
  App.disconnect();
});

socket.on('join', function(doc) {
  console.log('got: join: ',doc);
  var p = new Player(doc);
  Players.add(p);
});

socket.on('chat', function(d) {
  console.log('chat: ', d);
  var p = App.socketPlayer(d.sender);
  if (p) {
    Messages.add({body: d.body, player: p});
    $("#msg-list").scrollTop($("#msg-list")[0].scrollHeight);
  } else {
    console.log('unknown player sent chat:', d);
  }
});

socket.on('names', function(docs) {
  console.log('names', docs);
  for (var i in docs) {
    var p = new Player(docs[i]);
    Players.add(p);
  }
});

socket.on('part', function(doc) {
  console.log('part', doc);
  Players.remove(Players.get(doc._id));
});

$('form.chat input').focus();

$('form.chat').on('submit', function(e) {
  e.preventDefault();
  var $input = $(e.currentTarget).find('input');
  if ($input.val() != '') {
    socket.emit('chat', {body: $input.val()});
    $input.val('');
    $input.attr('placeholder','');
  }
});
