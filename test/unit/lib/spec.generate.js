'use strict';

const fs = require('fs');
const generate = require('../../../lib/generate');
const Hogan = require('hogan.js');
const unmarshal = require('../../../lib/unmarshal');
const PDF = require('../../../lib/pdf');
const ConcatStream = new require('concat-stream');

describe('generate', () => {
    let stubs, filename, locals, callback;

    beforeEach(() => {
        stubs = {};
        filename = 'filename';
        locals = {
            foo: 'bar',
            partials: {
                'partial': 'partial/path'
            }
        };
        callback = sinon.stub();
    });

    describe('compile', () => {
        beforeEach(() => {
            stubs.compiled = {};
            sinon.stub(Hogan, 'compile').returns(stubs.compiled);

            stubs.fileData = new Buffer('<pdf>fileData</pdf>');
            sinon.stub(fs, 'readFile').yields(null, stubs.fileData);
        });

        afterEach(() => {
            Hogan.compile.restore();
            fs.readFile.restore();
        });

        it('should be a function with 3 arguments', () => {
            generate.compile.should.be.a('function').and.have.lengthOf(3);
        });

        it('should read the content of the given filename', () => {
            generate.compile(filename, {}, callback);
            fs.readFile.should.have.been.calledWithExactly(filename, sinon.match.func);
        });

        it('should callback with file error', () => {
            let err = new Error();
            fs.readFile.yields(err);
            generate.compile(filename, {}, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should compile the file content', () => {
            generate.compile(filename, {}, callback);
            Hogan.compile.should.have.been.calledWithExactly('<pdf>fileData</pdf>');
        });

        it('should callback with compiled template', () => {
            generate.compile(filename, {}, callback);
            callback.should.have.been.calledWithExactly(null, stubs.compiled);
        });

        it('should callback a compiling error', () => {
            let err = new Error();
            Hogan.compile.throws(err);
            generate.compile(filename, locals, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should save compiled template to cache option is true', () => {
            generate.compile(filename, { cache: true }, callback);
            generate._cache[filename].should.equal(stubs.compiled);
        });

        it('should callback with cached compiled template if cache option is true', () => {
            let cached = {};
            generate._cache[filename] = cached;
            generate.compile(filename, { cache: true }, callback);
            callback.should.have.been.calledWithExactly(null, cached);
        });

    });

    describe('render', () => {
        beforeEach(() => {
            stubs.template = {
                render: sinon.stub()
            };
            sinon.stub(generate, 'compile').yields(null, stubs.template);

            stubs.rendered = '<pdf>Rendered</pdf>';
            stubs.template.render.returns(stubs.rendered);

            stubs.obj = {};
            sinon.stub(unmarshal, 'xmlToObject').yields(null, stubs.obj);
        });

        afterEach(() => {
            generate.compile.restore();
            unmarshal.xmlToObject.restore();
        });

        it('should be a function with 3 arguments', () => {
            generate.render.should.be.a('function').and.have.lengthOf(3);
        });

        it('should call compile', () => {
            generate.render(filename, locals, callback);
            generate.compile.should.have.been.calledWithExactly(filename, { cache: false }, sinon.match.func);
        });

        it('should pass cache flag to compile', () => {
            locals.cache = true;
            generate.render(filename, locals, callback);
            generate.compile.should.have.been.calledWithExactly(filename, { cache: true }, sinon.match.func);
        });

        it('should callback with compile error', () => {
            let err = new Error();
            generate.compile.yields(err);
            generate.render(filename, locals, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should render the template with the supplied locals', () => {
            generate.render(filename, locals, callback);
            stubs.template.render.should.have.been.calledWithExactly(locals, locals.partials);
        });

        it('should callback a rendering error', () => {
            let err = new Error();
            stubs.template.render.throws(err);
            generate.render(filename, locals, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should unmarshal the compiled xml to an object', () => {
            generate.render(filename, locals, callback);
            unmarshal.xmlToObject.should.have.been.calledWithExactly(stubs.rendered, sinon.match.func);
        });

        it('should callback an unmarshalling error', () => {
            let err = new Error();
            unmarshal.xmlToObject.yields(err);
            generate.render(filename, locals, callback);
            callback.should.have.been.calledWithExactly(err);
        });
    });

    describe('fileToStream', () => {
        beforeEach(() => {
            stubs.obj = {};
            sinon.stub(generate, 'render').yields(null, stubs.obj);

            stubs.doc = {};
            sinon.stub(PDF.prototype, 'render').returns(stubs.doc);
        });

        afterEach(() => {
            generate.render.restore();
            PDF.prototype.render.restore();
        });

        it('should be a function with 3 arguments', () => {
            generate.fileToStream.should.be.a('function').and.have.lengthOf(3);
        });

        it('should render the template given by the filename', () => {
            generate.fileToStream(filename, locals, callback);
            generate.render.should.have.been.calledWithExactly(filename, locals, sinon.match.func);
        });

        it('should callback with render error', () => {
            let err = new Error();
            generate.render.yields(err);
            generate.fileToStream(filename, locals, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should render a PDF from the unmarshalled data', () => {
            generate.fileToStream(filename, locals, callback);
            PDF.prototype.render.should.have.been.calledWithExactly();
            callback.should.have.been.calledWithExactly(null, stubs.doc);
        });

        it('should callback a PDF rendering error', () => {
            let err = new Error();
            PDF.prototype.render.throws(err);
            generate.fileToStream(filename, locals, callback);
            callback.should.have.been.calledWithExactly(err);
        });
    });

    describe('fileToBuffer', () => {
        beforeEach(() => {
            stubs.doc = {
                pipe: sinon.stub()
            };
            sinon.stub(generate, 'fileToStream').yields(null, stubs.doc);
        });

        afterEach(() => {
            generate.fileToStream.restore();
        });

        it('should be a function with 3 arguments', () => {
            generate.fileToBuffer.should.be.a('function').and.have.lengthOf(3);
        });

        it('should call fileToStream', () => {
            generate.fileToBuffer(filename, locals, callback);
            generate.fileToStream.should.have.been.calledWithExactly(filename, locals, sinon.match.func);
        });

        it('should callback with error from fileToStream', () => {
            let err = new Error();
            generate.fileToStream.yields(err);
            generate.fileToBuffer(filename, locals, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should pipe the document to contact to provide a buffer', done => {
            generate.fileToBuffer(filename, locals, callback);
            stubs.doc.pipe.should.have.been.calledWithExactly(sinon.match.instanceOf(ConcatStream));
            let concat = stubs.doc.pipe.getCall(0).args[0];
            concat.write([1, 2, 3]);
            concat.write([4, 5, 6]);
            concat.end();
            concat.on('finish', () => {
                callback.should.have.been.calledWithExactly(null, [1, 2, 3, 4, 5, 6]);
                done();
            });
        });

        it('should copy the filename from the stream', done => {
            stubs.doc.filename = 'filename';
            generate.fileToBuffer(filename, locals, callback);
            let concat = stubs.doc.pipe.getCall(0).args[0];
            concat.write([1, 2, 3]);
            concat.end();
            concat.on('finish', () => {
                let data = callback.args[0][1];
                data.filename.should.equal('filename');
                done();
            });

        });

    });

    describe('fileToFile', () => {
        let destFileName;

        beforeEach(() => {
            destFileName = 'destfile';
            stubs.doc = {
                pipe: sinon.stub(),
            };
            stubs.stream = {
                on: sinon.stub()
            };
            sinon.stub(generate, 'fileToStream').yields(null, stubs.doc);
            sinon.stub(fs, 'createWriteStream').returns(stubs.stream);
        });

        afterEach(() => {
            generate.fileToStream.restore();
            fs.createWriteStream.restore();
        });

        it('should be a function with 4 arguments', () => {
            generate.fileToFile.should.be.a('function').and.have.lengthOf(4);
        });

        it('should call fileToStream', () => {
            generate.fileToFile(filename, locals, destFileName, callback);
            generate.fileToStream.should.have.been.calledWithExactly(filename, locals, sinon.match.func);
        });

        it('should callback with error from fileToStream', () => {
            let err = new Error();
            generate.fileToStream.yields(err);
            generate.fileToFile(filename, locals, destFileName, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should create a file stream with the dest filename', () => {
            generate.fileToFile(filename, locals, destFileName, callback);
            fs.createWriteStream.should.have.been.calledWithExactly(destFileName);
        });

        it('should pipe the document to contact to file stream', () => {
            generate.fileToFile(filename, locals, destFileName, callback);
            stubs.doc.pipe.should.have.been.calledWithExactly(stubs.stream);
            callback.should.not.have.been.called;
        });

        it('should call the callback when the pipe is complete', () => {
            stubs.stream.on.withArgs('finish').yields(null);
            generate.fileToFile(filename, locals, destFileName, callback);
            callback.should.have.been.calledWithExactly(null);
        });

    });

    describe('engine', () => {
        beforeEach(() => {
            sinon.stub(generate, 'fileToBuffer').yields();
            sinon.stub(generate, 'fileToStream').yields();
        });

        afterEach(() => {
            generate.fileToBuffer.restore();
            generate.fileToStream.restore();
        });

        it('should be a function with 3 arguments', () => {
            generate.engine.should.be.a('function').and.have.lengthOf(3);
        });

        it('should call fileToBuffer', () => {
            generate.engine(filename, locals, callback);
            generate.fileToBuffer.should.have.been.calledWithExactly(filename, locals, callback);
        });

        it('should call fileToStream if stream flag is true', () => {
            locals.stream = true;
            generate.engine(filename, locals, callback);
            generate.fileToStream.should.have.been.calledWithExactly(filename, locals, callback);
        });

        it('should also be exported as __express', () => {
            generate.__express.should.equal(generate.engine);
        });
    });
});
