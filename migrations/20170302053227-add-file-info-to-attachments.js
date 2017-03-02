'use strict';

var dbm;
var type;
var seed;

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
    return db.addColumn('attachments', 'file_name', {type: 'string'}).then(() =>
        db.addColumn('attachments', 'content_type', {type: 'string'}));
};

exports.down = function (db) {
    return db.removeColumn('attachments', 'file_name').then(() =>
        db.removeColumn('attachments', 'content_type'));
};

exports._meta = {
    "version": 1
};
