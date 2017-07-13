'use strict';

const debug = require('debug')('hmpo:pdf:generate');
const Hogan = require('hogan.js');
const unmarshal = require('./unmarshal');
const PDF = require('./pdf');
const fs = require('fs');
const path = require('path');
const concat = require('concat-stream');

const generate = {
    _cache: {},

    compile(filePath, options, callback) {
        let cached = generate._cache[filePath];
        if (options.cache && cached) return callback(null, cached);

        fs.readFile(filePath, (err, content) => {
            if (err) return callback(err);

            let compiled;

            try {
                let fileContent = content.toString();
                debug('File XML', fileContent);
                compiled = Hogan.compile(fileContent);
            } catch (e) {
                return callback(e);
            }

            if (options.cache === true) {
                generate._cache[filePath] = compiled;
            }

            callback(null, compiled);
        });
    },

    render(filePath, locals, callback) {
        generate.compile(filePath, { cache: Boolean(locals.cache) }, (err, compiled) => {
            if (err) return callback(err);

            let xml;

            try {
                xml = compiled.render(locals, locals.partials);
                debug('Compiled XML', xml);
            } catch (e) {
                return callback(e);
            }

            unmarshal.xmlToObject(xml, callback);
        });
    },

    fileToStream(filePath, locals, callback) {
        generate.render(filePath, locals, (err, data) => {
            if (err) return callback(err);

            let pdf, doc;

            try {
                pdf = new PDF(data, { basePath: path.dirname(filePath) });
                doc = pdf.render();
            } catch (e) {
                return callback(e);
            }

            callback(null, doc);
        });
    },

    fileToBuffer(filePath, locals, callback) {
        generate.fileToStream(filePath, locals, (err, doc) => {
            if (err) return callback(err);
            doc.pipe(concat(data => {
                if (doc.filename) data.filename = doc.filename;
                callback(null, data);
            }));
        });
    },

    fileToFile(filePath, locals, destFile, callback) {
        generate.fileToStream(filePath, locals, (err, doc) => {
            if (err) return callback(err);
            let stream = fs.createWriteStream(destFile);
            doc.pipe(stream);
            stream.on('finish', callback);
        });
    },

    engine(filePath, locals, callback) {
        if (locals.stream === true) {
            generate.fileToStream(filePath, locals, callback);
        } else {
            generate.fileToBuffer(filePath, locals, callback);
        }
    }
};

generate.__express = generate.engine;

module.exports = generate;
