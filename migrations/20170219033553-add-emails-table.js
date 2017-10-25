'use strict';

let dbm;
let type;
let seed;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
exports.setup = function (options, seedLink) {
    dbm = options.dbmigrate;
    type = dbm.dataType;
    seed = seedLink;
};

exports.up = function (db) {
    return db.createTable('emails', {
        id: {type: 'string', primaryKey: true},
        email_id: 'string',
        from_email: 'string',
        from_name: 'string',
        to_email: 'string',
        to_name: 'string',
        subject: 'string',
        text_body: 'string',
        html_body: 'string',
        is_html: 'boolean',
        received_timestamp: 'timestamp',
        target_room: 'string'
    });
};

exports.down = function (db) {
    return db.dropTable('emails');
};

exports._meta = {
    "version": 1
};
