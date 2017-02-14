var sdk = require('matrix-js-sdk');
var config = require("config");
var striptags = require("striptags");

var roomList = [];
var client = null;
var selfUserId = config.get('matrix.user_id');

function init() {
    client = sdk.createClient({
        baseUrl: config.get('matrix.homeserver_url'),
        accessToken: config.get('matrix.access_token'),
        userId: selfUserId
    });

    client.on('sync', function (state, prevState, data) {
        switch (state) {
            case 'PREPARED':
                updateRoomList();
                break;
        }
    });

    client.on('Room', function () {
        updateRoomList();
    });

    client.startClient(25); // limit to a very small number of messages per room - not interested in keeping traffic
}

function updateRoomList() {
    roomList = [];
    var rooms = client.getRooms();
    for (var i = 0; i < rooms.length; i++) {
        var room = rooms[i];

        var me = room.getMember(selfUserId);
        if (!me) continue;

        if (me.membership == 'invite') {
            client.joinRoom(room.currentState.roomId);
            continue;
        }

        if (me.membership != 'join') continue;
        roomList.push(room.currentState.roomId);
    }
}

function postMessageToRoom(message, roomId) {
    // message: { id, email_id, from_email, from_name, to_email, to_name, subject, body, url, is_html, received_timestamp }
    if (roomList.indexOf(roomId) === -1) {
        return; // do not post - not in room
    }

    var msgFormat = config.rules[roomId].message_format;
    if (!msgFormat) msgFormat = config.room_defaults.message_format;
    if (!msgFormat) msgFormat = "Configuration error: No message format set for room.";

    var mtxMessage = msgFormat.toString();
    for (var property in message) {
        mtxMessage = mtxMessage.replace("$" + property, message[property]);
    }

    var mtxContent = {
        body: striptags(mtxMessage),
        msgtype: "m.text",
        formatted_body: mtxMessage,
        format: "org.matrix.custom.html"
    };
    client.sendMessage(roomId, mtxContent);
}

module.exports = {
    init: init,
    postMessageToRoom: postMessageToRoom
};
