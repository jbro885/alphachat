var g_fbqa;
function fb_query_args() {
    var assoc = {};
    var qs = unescape(location.search.substring(1));
    var keyValues = qs.split('&');
    for (var i in keyValues) {
        var kv = keyValues[i].split('=');
        if (kv[0].match(/^fb_sig/))
            assoc[kv[0]] = kv[1];
    }
    return assoc;
}

function add_slash(url) {
    if (url[url.length-1] == '/') return url;
    return url + '/';
}

function get(url, onSuccess, onError) {
    $.ajax({url: add_slash(url)+'?'+$.param(g_fbqa),
            type: "GET",
            dataType: "json",
            cache: false,
            timeout: 50000,     // 50 seconds
            success: onSuccess,
            error: onError});
}

function post(url, args, onSuccess, onError) {
    $.extend(args, g_fbqa);
    $.ajax({url: add_slash(url),
            type: "POST",
            data: $.param(args),
            dataType: "json",
            success: onSuccess,
            error: onError});
}
function get_html(url, selector, onSuccess) {
    $.ajax({url: add_slash(url),
            type: "GET",
            dataType: "json",
            success: function(r) {
                $(selector).html(r.html);
                if (onSuccess) onSuccess();
            },
            error: function(xhr, status, error) {
                var errstr = 'get_html error: '+status+'\n'+error;
                alert(errstr);
                $(selector).html(errstr);
            }});
}

// main
$(document).ready(function() {
        g_fbqa = fb_query_args();
        if (!window.console) window.console = {};
        if (!window.console.log) window.console.log = function() {};
        // start us off by loading the menu
        get_html('/mainmenu.html', "#content",
             function() {
                 $("#chatters").html('')
                 $("#go_chat").bind("click", lobby.setup);
             });
    });

// budget generic error handler
function on_error(xhr, status) { alert(status); }

var lobby = {
    setup: function() {
        // setup the page, then find a room
        get_html('/lobby.html', "#content", lobby.find_room);
    },
    find_room: function() {
        $("#lobby_box").append(". ");
        // send message to server to indicate we are waiting to play
        get('/a/lobby/find_room/', 
            function(response) {
                if (response) {
                    room_id = response.room_id;
                    my_color = response.color;
                    since = response.since;
                    chat.setup(room_id, my_color, since);
                } else {
                    // server time-out, go again
                    $("#lobby_box").append('<div>WARNING: find_room: server timeout</div>');
                    window.setTimeout(lobby.find_room, 0);
                }
            },
            function(xhr,status) {
                if (status == 'timeout')
                    // client timeout, no problem
                    window.setTimeout(lobby.find_room, 0);
            });
    }
}

var chat = {
    room: {},
    my_color: '',
    since: 0,
    error_wait: 100,

    setup: function(room_id, color, since) {
        chat.room.id = room_id;
        chat.my_color = color;
        chat.since = since;
        chat.error_wait = 100;

        // request the chat page
        get_html("/chat.html", "#content", 
             function() {
                 // focus the input bar
                 $("input:text:visible:first").focus();

                 // show the room id in the chat window
                 $('#chat').html('<div>match: ' + chat.room.id + '</div>');

                 // wire up the form submit event to send messages to server
                 $('#inputform').bind('submit', 
                                      function(e) { 
                                          chat.form_submit($(this));
                                          return false; 
                                      });
                 $('inputform').keydown(function(e){
                     if (e.keyCode == 13) {
                         $(this).parents('form').submit();
                         return false;
                     }
                 });

                 // start the send message queue
                 queue.start(chat.send_message, 100);

                 // wait for messages
                 chat.poll();

                 // tell server we are ready to go
                 //alert("delay join");
                 window.setTimeout(chat.join, 100);
             });
    },

    join: function() {
        chat.queue_message({command:'join'});
    },

    poll: function() {
        get('/a/room/msgs/'+chat.room.id+'/'+chat.since+'/',
            // success
            function(response) {
                chat.error_wait = 100;
                chat.since = response.since;
                m = response.messages;

                for (i in m) {
                    var msg = m[i];
                    html = $("#msgtpl_" + msg.command).jqote(msg);
                    chat.display_html(html);

                    switch (msg.command) {
                    case 'state':
                        switch (msg.state) {
                        case 'vote':
                            chat.display_html("<div>VOTANG</div>");
                            break;
                        case 'results':
                            // show return to main menu button
                            $("#menubutton").css('display','inline');
                            break;
                        case 'chat':
                            break;
                        default:
                            alert("unknown state:"+msg.state);
                        }
                        break;
                    case 'join':
                        // todo: draw the player card in the sidebar
                        card = $("#msgtpl_player").jqote(msg);

                        if (msg.color == chat.my_color) 
                            $("#card_me").append(card);
                        else
                            $("#card_others").append(card);

                        break;
                    }
                }
                
                window.setTimeout(chat.poll, 0);
            },
            // error
            function(xhr,status) {
                chat.display_html('<div>on_poll: ' + status + '</div>');
                if (status == 'timeout')
                    wait_for = 100;
                else
                    wait_for = (chat.error_wait *= 2);

                setTimeout(chat.poll, wait_for);
            });
    },

    form_submit: function(form) {
        //var message = form.formToDict();
        input = $("#inputbar")// TODO: should be able to get this from the FORM arg
        if (input.val() != "") {
            chat.queue_message({command:'privmsg', body:input.val()});
            input.val("");
        }
    },
    queue_message: function(msgobj) {
        //chat.display_html('<div>'+msg+'</div>');
        queue.add(msgobj);
    },
    send_message: function(msgobj) {
        post('/a/room/post/'+chat.room.id, 
             msgobj, chat.onSendMessageSuccess, on_error);
    },
    onSendMessageSuccess: function(response) {
        // the response has the message if we want to do something
        // with it here
    },

    display_html: function(html) {
        var div = $("#chat")
        div.append(html);
        // certain browsers have a bug such that scrollHeight is too small
        // when content does not fill the client area of the element
        var scrollHeight = Math.max(div[0].scrollHeight, div[0].clientHeight);
        div[0].scrollTop = scrollHeight - div[0].clientHeight;
    },
}


// ################################################################
var queue = {
    data: Array(),
    fn: null,
    interval_id: null,

    add: function(obj) {
        queue.data.push(obj);
    },
    // next: function() {
    //     return queue.data.shift();
    // },
    start: function(fn, timeout) {
        queue.fn = fn;
        queue.interval_id = setInterval("queue.run()", timeout);
    },
    stop: function() {
        clearInterval(queue.interval_id);
    },
    run: function() {
        if (queue.data.length > 0) {
            console.log("running queue function on data: "+queue.data);
            queue.fn(queue.data.shift());
        }
    }
}
