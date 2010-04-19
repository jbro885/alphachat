import uuid
import simplejson
import datetime
from time import time
from django.shortcuts import render_to_response
from django.template.loader import render_to_string
from django.template import RequestContext
from django.http import HttpResponse
from djangoac import settings

import facebook.djangofb as facebook

from alphachat.models import Player, Room, Message
from alphachat.session import Session
from alphachat.event import wait_for_change, wait_for_changes, get_seq, Timeout
from alphachat.debug import log

from couchdbkit import Consumer
from couchdbkit.ext.django.loading import get_db

def json_response(value, **kwargs):
    kwargs.setdefault('content_type', 'text/javascript; charset=UTF-8')
    return HttpResponse(simplejson.dumps(value), **kwargs)

def get_pic(fb, uid):
    face = fb.users.getInfo([uid], ['pic_square'])[0]['pic_square']
    log("FACE: %s"%face)
    return face

### exceptions
class BadCommand(Exception): pass

################
# top level views
################
@facebook.require_login()
def index(request): 
    print "***"
    print "*"
    print "* landing page"
    print "*"
    print "***"
    fb_uid = str(request.facebook.uid)
    assert fb_uid

    # get or create player
    result = Player.view('alphachat/player__fb_uid', key=fb_uid)
    if result.count() == 1:
        player = result.first()
    else:
        player = Player().create(request)
    player.state = 'lobby'
    player.save()

    return render_to_response('index.html', RequestContext(request))

#@facebook.require_login()
def html_content(request, page):
    html = render_to_string(page, {}, RequestContext(request))
    return json_response({'html':html})

def get_player(request):
    fb_uid = str(request.facebook.uid)
    player = Player.view('alphachat/player__fb_uid', key=fb_uid).one()
    return player

@facebook.require_login()
def lobby_find_room(request):
    """
    Mark player as available for chat
    """
    player = get_player(request)

    since = get_seq(player.get_db())

    # set our state, and go to sleep until someone wakes us up
    if player.state != 'ondeck':
        player.state = 'ondeck'
        player.save()

    try:
        player = wait_for_change(player, since, 1000)
        log('player: %s changed' % player)
    except Timeout:
        log("player: %s no change, TIMEOUT" % player)

    if player.state == 'chat':
        return json_response({'room_id': player.room_id,
                              'color': player.color,
                              'vote': player.vote_color,
                              'face': get_pic(request.facebook, request.facebook.uid),
                              'since': get_seq(get_db('alphachat'))})
    else:
        player.state = 'lobby'
        player.save()
        return json_response(False)

def scrub_message(doc):
    """Remove identifying information from doc."""
    doc.player_id = None
    return doc

@facebook.require_login()
def message_updates(request, room_id, since):
    # TODO: verify that this user is in this room
    log("waiting for messages on: %s" % room_id)
    docs, since = wait_for_changes(get_db('alphachat'),
                                   doc_type="Message", 
                                   by_key="room_id", by_value=room_id, 
                                   since=since)

    # TODO: process messages one by one by command type.  maybe filter
    # some out for return to the client, ie dont send back their own
    # messages, certain system messages, etc
    #msgs = filter(message_is_public, 

    # remove player_ids from messages
    msgs = map(lambda doc: doc.all_properties(), 
               map(scrub_message, docs))
    return json_response({'since': since, 
                          'messages': msgs})

@facebook.require_login()
def message_new(request, room_id):
    # TODO: make sure player is in room, do other validation.
    player = get_player(request)

    if request.method == 'POST':
        data = request.POST
        log('new_message: %s'%request.POST)
        if data['command'] == 'join':
            Message().Join(room_id, player._id).save()
            player.join = True
            player.save()
        elif data['command'] == 'vote':
            # we hold the vote in the player object until the end of the round
            player.vote_color = data['color']
            player.save()
            log("caching a vote from %s for %s"%(player._id, player.vote_color))
        elif data['command'] == 'privmsg':
            Message().Chat(room_id, player._id, data['body']).save()
        else:
            raise BadCommand

    return json_response(True)

################
# debugging
################
def test_foo(request):
    g_event.wakeup('dummyid')
    return HttpResponse(True)
