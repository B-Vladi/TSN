/**
 * @fileOverview Описание тегов шаблонизатора TSN.
 * @author <a href="mailto:b-vladi@cs-console.ru">Влад Куркин</a>
 */
this.root = {
	parse: function () {
		if (this.attributes.hasOwnProperty('context')) {
			this.template = '' +
				'(function () {' +
					'/*!code*/' +
				'}).call(/*!context*/);';
		}
	},
	template: '/*!code*/'
};

this['comment'] = {
	template: ''
};

this.context = {
	parse: function () {
		if (!this.attributes.hasOwnProperty('object')) {
			this.template = '/*!code*/';
		}
	},
	template: '' +
		'(function () {' +
			'/*!code*/' +
		'}).call(/*@object*/);'
};

this.echo = (function () {
	var format = {
		text: 'String(/*text*/)',
		json: 'JSON.stringify(/*text*/)'
	};

	var escape = {
		js: '.replace(/(\'|"|(?:\\r\\n)|\\r|\\n|\\\\)/g, "\\\\$1")',

		url: 'encodeURI(/*text*/)',

		html: '' +
			'.replace(/&/g, "&amp;")' +
			'.replace(/</g, "&lt;")' +
			'.replace(/>/g, "&gt;")' +
			'.replace(/\"/g, "&quot;")',

		htmlDec: '' +
			'.replace(/&/g, "&#38;")' +
			'.replace(/</g, "&#60;")' +
			'.replace(/>/g, "&#62;")' +
			'.replace(/\"/g, "&#34;")',

		htmlHex: '' +
			'.replace(/&/g, "&#x26;")' +
			'.replace(/</g, "&#x3c;")' +
			'.replace(/>/g, "&#x3e;")' +
			'.replace(/\"/g, "&#x22;")'
	};

	return {
		parse: function () {
			var attributes = this.attributes;
			var template = attributes.hasOwnProperty('data') ? attributes.data : 'this';

			if (!attributes.hasOwnProperty('format')) {
				attributes.format = 'text';
			}

			if (format.hasOwnProperty(attributes.format)) {
				template = format[attributes.format].replace('/*text*/', template);
			} else {
				return Error('Invalid value of "' + attributes.escape + '" attribute "format"');
			}

			if (attributes.hasOwnProperty('escape')) {
				if (escape.hasOwnProperty(attributes.escape)) {
					template += escape[attributes.escape];
				} else {
					return Error('Invalid value of "' + attributes.escape + '" attribute "escape"');
				}
			}

			this.template = template;
		},
		inline: true
	};
})();

this['data'] = {
	start: function () {
		return 'var _data = {};';
	},
	parse: function () {
		var attributes = this.attributes;

		if (!attributes.hasOwnProperty('name')) {
			return new Error('Attribute "name" is not defined.');
		}

		if (!attributes.hasOwnProperty('value')) {
			this.template = '' +
				'_data["/*@name*/"] = (function (__output, __text) {' +
					'var __hasStream = false;' +
					'/*!code*/' +
					'return __output;' +
				'}).call(/*!context*/, "", "");';
		}
	},
	template: '_data["/*@name*/"] = (/*@value*/);'
};

this['if'] = {
	parse: function () {
		if (!this.attributes.hasOwnProperty('test')) {
			this.attributes.test = 'this';
		}
	},
	template: '' +
		'if (/*@test*/) {' +
			'/*!code*/' +
		'}'
};

this.unless = {
	parse: function () {
		if (!this.attributes.hasOwnProperty('test')) {
			this.attributes.test = 'this';
		}
	},
	template: '' +
		'if (!(/*@test*/)) {' +
			'/*!code*/' +
		'}'
};

this['else'] = {
	parse: function () {
		var parent = this.parent;
		var attributes = this.attributes;

		if (!(parent.name === 'if' || parent.name === 'unless')) {
			return new Error('Tag "else" must have a parent "if".');
		} else if (parent.hasElse) {
			return new Error('Tag "if" should have one child "else".');
		} else if (this.isEmpty) {
			parent.template = parent.template.replace('/*!code*/', parent.code).slice(0, -1) + '/*!code*/}';
			parent.code = '';

			if (attributes.hasOwnProperty('if')) {
				this.template = '} else if (' + attributes['if'] + ') {/*!code*/'
			} else if (attributes.hasOwnProperty('unless')) {
				this.template = '} else if (!(' + attributes['unless'] + ')) {/*!code*/'
			} else {
				parent.hasElse = true;
			}
		} else {
			return new Error('Tag else should be a single');
		}
	},
	template: '} else {/*!code*/'
};

this['each'] = {
	parse: function () {
		var attributes = this.attributes;
		var hasItem = attributes.hasOwnProperty('item');

		if (attributes.hasOwnProperty('array')) {
			this.template = '' +
				'(function (_array) {' +
					'var _length = _array.length;' +
					'var _index = 0;' +
					'while (_index < _length) {' +
						(hasItem ? 'var /*@item*/ = _array[_index];' : '') +
						'/*!code*/' +
						'_index++;' +
					'}' +
				'}).call(/*!context*/, /*@array*/);';
		} else if (attributes.hasOwnProperty('object')) {
			this.template = '' +
				'(function (_object) {' +
					'for (var _property in _object) {' +
						'if (_object.hasOwnProperty(_property)) {' +
							(hasItem ? 'var /*@item*/ = _object[_property];' : '') +
							'/*!code*/' +
						'}' +
					'}' +
				'}).call(/*!context*/, /*@object*/);';
		} else {
			return new Error('Attribute "array" or "object" is not defined.');
		}
	}
};


(function (API) {
	var path = require('path');

	function escape(text) {
		return text.replace(/('|"|(?:\r\n)|\r|\n|\\)/g, "\\$1");
	}

	function addCode (parser) {
		if (parser.hasTemplates !== true) {
			parser.root.code += ';' +
				'function __Template () {}' +
				'__Template.prototype = TSN.parentTemplate;' +
				'var __template = new __Template;' +
				'delete TSN.parentTemplate;';

			parser.hasTemplates = true;
		}
	}

	API.template = {
		end: function (parser) {
			if (parser.parent) {
				return ';' +
					'__output += __text;' +
					'__hasStream && __text !== "" && __stream.write(__text, "' + parser.config.encoding + '");' +
					'__hasStream = false;'
			}
		},
		parse: function (parser) {
			var attributes = this.attributes;

			if (attributes.hasOwnProperty('name')) {
				if (attributes.name === '') {
					return new Error('Attribute "name" is empty.');
				} else {
					addCode(parser);

					this.template = '' +
						'__template["' + escape(attributes.name) + '"] = function (__output, __text) {' +
						this.code +
						';' +
						'__output += __text;' +
						'__hasStream && __text !== "" && __stream.write(__text, "' + parser.config.encoding + '");' +
						'; return __output;' +
						'};';
				}
			} else {
				return new Error('Attribute "name" is not defined.');
			}
		},
		template: ''
	};

	API['include'] = {
		parse: function (parser, TSN) {
			var attributes = this.attributes;
			var prototype;
			var template;

			addCode(parser);

			if (attributes.hasOwnProperty('src')) {
				prototype = parser.constructor.prototype;
				prototype.parent = parser;

				if (attributes.src.charAt(0) !== '/') {
					if (!parser.config.hasOwnProperty('path')) {
						parser.config.path = parser.config.templateRoot;
					}

					attributes.src = path.relative(parser.config.templateRoot, path.resolve(parser.config.path, attributes.src));
				}

				template = TSN.load(attributes.src, null, parser.config);

				delete prototype.parent;

				this.template = ';' +
					'TSN.parentTemplate = __template;' +
					'__output += TSN.cache["' + escape(template.cacheName) + '"].call(/*!context*/, __stream);';

			} else if (attributes.hasOwnProperty('name')) {
				this.template = ';__output += __template["' + escape(attributes.name) + '"].call(/*!context*/, "", "");';
			} else {
				return new Error('Attribute "name" or "src" is not defined.');
			}
		}
	};
})(this);