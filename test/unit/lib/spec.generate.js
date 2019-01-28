'use strict';

let sinon = require('sinon');
const chai = require('chai');
chai.should();
chai.use(require('sinon-chai'));

const fs = require('fs');
const generate = require('../../../lib/generate');
const Hogan = require('hogan.js');
const xmlToPdf = require('xml-to-pdf');

describe('generate', () => {
    let stubs, filename, locals, callback;

    beforeEach(() => {
        stubs = {};
        stubs.compiled = {};
        stubs.rendered = '<pdf>Rendered</pdf>';
        filename = 'path/to/filename.xml';
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
        });

        afterEach(() => {
            generate.compile.restore();
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

        it('should callback the rendered xml', () => {
            generate.render(filename, locals, callback);
            callback.should.have.been.calledWithExactly(null, stubs.rendered);
        });
    });

    describe('fileToStream', () => {
        beforeEach(() => {
            sinon.stub(generate, 'render').yields(null, stubs.rendered);
            sinon.stub(xmlToPdf, 'toStream');
        });

        afterEach(() => {
            generate.render.restore();
            xmlToPdf.toStream.restore();
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

        it('should render a PDF to a stream', () => {
            generate.fileToStream(filename, locals, callback);
            xmlToPdf.toStream.should.have.been.calledWithExactly(stubs.rendered, 'path/to', callback);
        });
    });

    describe('fileToBuffer', () => {
        beforeEach(() => {
            sinon.stub(generate, 'render').yields(null, stubs.rendered);
            sinon.stub(xmlToPdf, 'toBuffer');
        });

        afterEach(() => {
            generate.render.restore();
            xmlToPdf.toBuffer.restore();
        });

        it('should be a function with 3 arguments', () => {
            generate.fileToBuffer.should.be.a('function').and.have.lengthOf(3);
        });

        it('should render the template given by the filename', () => {
            generate.fileToBuffer(filename, locals, callback);
            generate.render.should.have.been.calledWithExactly(filename, locals, sinon.match.func);
        });

        it('should callback with render error', () => {
            let err = new Error();
            generate.render.yields(err);
            generate.fileToBuffer(filename, locals, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should render a PDF to a stream', () => {
            generate.fileToBuffer(filename, locals, callback);
            xmlToPdf.toBuffer.should.have.been.calledWithExactly(stubs.rendered, 'path/to', callback);
        });
    });

    describe('fileToFile', () => {
        let destFileName;

        beforeEach(() => {
            destFileName = 'destfile';
            sinon.stub(generate, 'render').yields(null, stubs.rendered);
            sinon.stub(xmlToPdf, 'toFile');
        });

        afterEach(() => {
            generate.render.restore();
            xmlToPdf.toFile.restore();
        });

        it('should be a function with 4 arguments', () => {
            generate.fileToFile.should.be.a('function').and.have.lengthOf(4);
        });

        it('should render the template given by the filename', () => {
            generate.fileToFile(filename, locals, destFileName, callback);
            generate.render.should.have.been.calledWithExactly(filename, locals, sinon.match.func);
        });

        it('should callback with render error', () => {
            let err = new Error();
            generate.render.yields(err);
            generate.fileToFile(filename, locals, destFileName, callback);
            callback.should.have.been.calledWithExactly(err);
        });

        it('should render a PDF to a stream', () => {
            generate.fileToFile(filename, locals, destFileName, callback);
            xmlToPdf.toFile.should.have.been.calledWithExactly(stubs.rendered, 'path/to', destFileName, callback);
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
