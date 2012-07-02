/**
 * @fileOverview Парсер TEN-шаблона.
 * @author <a href="mailto:b-vladi@cs-console.ru">Влад Куркин</a>
 */
var regExpSpace = '(?:(?:(?:\\r\\n)|\\r|\\n)[^\\S\\r\\n]*)*';
var regExpAttr = /\s*([a-z\-_]+(?::[a-z\-_]+)?)\s*(?:=\s*(?:(?:(?:\\)?"([^"]*?)(?:\\)?")|(?:(?:\\)?'([^']*?)(?:\\)?')))?/gi;
var regExpDTD = '\x3c!DOCTYPE\\s+[a-z\\-_]+(?::[a-z\\-_]+)?(?:(?:\\s+PUBLIC\\s*(?:(?:"[^"]*")|(?:\'[^\']*\'))?\\s*(?:(?:"[^"]*")|(?:\'[^\']*\'))?(?:\\s*\\[[\\s\\S]*?\\])?)|(?:\\s+SYSTEM\\s*(?:(?:"[^"]*")|(?:\'[^\']*\'))?(?:\\[[\\s\\S]*?\\])?)|(?:\\s*\\[[\\s\\S]*?\\]))?\\s*>';
var regExpXML = new RegExp(regExpSpace + '^\\s*<\\?xml(?:\\s+[a-z\\-_]+(?::[a-z\\-_]+)?\\s*=\\s*"[^"]*")*\\s*\\?>\\s*(' + regExpSpace + regExpDTD + ')?');
var regExpCDATA = '|(?:<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)';
var regExpComment = regExpSpace + '<!--(?!\\[if [^\\]]+?\\]>)[\\s\\S]*?(?!<!\\[endif\\])-->';

/**
 * Парсер TEN-шаблона.
 * @param {string} source Исходный код шаблона.
 * @param {object} config Объект конфигурации шаблона.
 * @constructor
 */
function Parser (source, config) {
	var cdata = config.parseCDATA === true ? '' : regExpCDATA;
	var xmlDeclaration = config.removeXMLDeclaration !== false && source.match(regExpXML);
	var lastIndex = 0;
	var parseResult, attribute, text, regExp;

	if (xmlDeclaration) {
		xmlDeclaration = xmlDeclaration[0];
		source = source.substring(xmlDeclaration.length);
	} else {
		xmlDeclaration = '';
	}

	if (!(config.namespace && (/[a-z\d\-_]+/i).test(config.namespace))) {
		this.onError(new Error('Invalid namespace.'));
		config.namespace = 'ten';
	}

	if (typeof config.tabSize !== 'number' || config.tabSize < 1) {
		this.onError(new Error('Invalid tab size.'));
		config.tabSize = 2;
	} else {
		config.tabSize = Number(config.tabSize.toFixed(0));
	}

	if (typeof config.indent !== 'number' || config.indent < 1) {
		this.onError(new Error('Invalid indent.'));
		config.indent = 2;
	} else {
		config.indent = Number(config.indent.toFixed(0));
	}

	regExp = new RegExp('(?:' + regExpSpace + '&' + config.namespace + '.([a-z0-9\\-_\\.]+)?;)|(' + regExpComment + ')' + cdata + '|(?:' + regExpSpace + '(' + regExpDTD + '))|(?:' + regExpSpace + '<\\/\\s*' + config.namespace + ':([a-z\\-_]+)\\s*>)|(?:' + regExpSpace + '<\\s*' + config.namespace + ':([a-z\\-_]+)((?:\\s+[a-z\\-_]+(?::[a-z\\-_]+)?\\s*=\\s*(?:(?:(?:\\\\)?"[^"]*(?:\\\\)?")|(?:(?:\\\\)?\'[^\']*(?:\\\\)?\')))*)\\s*(\\/)?>)', 'gi');

	/**
	 * Объект конфигурации шаблона: {@link TEN.config}.
	 * @type object
	 */
	this.config = config;

	/**
	 * Текущая глубина тегов.
	 * @type number
	 */
	this.depth = 0;

	/**
	 * Код XML-декларации.
	 * @type string
	 */
	this.xmlDeclaration = xmlDeclaration;

	/**
	 * Код шаблона без XML-декларации.
	 * @type string
	 */
	this.content = source;

	/**
	 * Текущий объект тега.
	 * @type object
	 */
	this.current = {
		index: 0,
		source: ''
	};

	/**
	 * Объект корневого тега шаблона.
	 * @type object
	 */
	this.root = this.current;

	this.onStart();

	while (parseResult = regExp.exec(source)) {
		var result = parseResult[0];
		var entity = parseResult[1];
		var comment = parseResult[2];
		var dtd = parseResult[3];
		var closeNodeName = parseResult[4];
		var openNodeName = parseResult[5];
		var attributes = parseResult[6];
		var isEmpty = parseResult[7];
		var index = parseResult.index;

		text = source.substring(lastIndex, index);

		if (text) {
			this.onText(text, this.current);
		}

		if (entity) {
			this.onEntity({
				index: index,
				source: result,
				parent: this.current,
				name: entity
			});
		} else if (openNodeName) {
			var newNode = {
				index: index,
				source: result,
				name: openNodeName.toLowerCase(),
				isEmpty: isEmpty,
				parent: this.current,
				attributes: {}
			};

			while (attribute = regExpAttr.exec(attributes)) {
				newNode.attributes[attribute[1].toLowerCase()] = (attribute[2] || attribute[3])
					.replace(/&amp;/g, '&')
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&quot;/g, '"')
					.replace(/&apos;/g, '\'');
			}

			this.onOpen(newNode);

			if (!isEmpty) {
				this.depth++;
				this.current = newNode;
			}
		} else if (closeNodeName) {
			var parent = this.current.parent;

			closeNodeName = closeNodeName.toLowerCase();

			if (this.current.name === closeNodeName) {

				this.onClose({
					index: index,
					source: result,
					name: closeNodeName,
					parent: parent
				});

				this.depth--;
				this.current = parent;
			} else if (parent && closeNodeName === parent.name) {
				this._error('Tag is not closed.', this.current);

				parent.code += this.current.code;

				this.current = parent;
				this.depth--;

				this.onClose({
					index: index,
					source: result,
					name: closeNodeName,
					parent: parent
				});

				this.current = parent.parent;
				this.depth--;
			} else {
				this._error('Closing tag matches nothing.', {
					index: index,
					source: result,
					name: closeNodeName
				});
			}
		} else if (comment) {
			if (this.config.saveComments === true) {
				this.onText(result, this.current);
			}
		} else { // CDATA or DTD
			this.onText(dtd || result, this.current);
		}

		lastIndex = index + result.length;
	}

	if (text = source.substring(lastIndex)) {
		this.onText(text, this.current);
	}

	if (this.depth) {
		do {
			if (this.current !== this.root) {
				this._error('Tag is not closed.', this.current);
			}
		} while (this.current = this.current.parent);
	}

	this.onEnd();

	return this;
}

/**
 * Создание ошибки парсинга тега.
 * @param {string} message Сообщение ошибки.
 * @param {object} node Объект тега, для которого генерируется ошибка.
 * @private
 */
Parser.prototype._error = function (message, node) {
	var error = new Error(message);
	var content = (this.xmlDeclaration + this.content).substr(0, node.index + this.xmlDeclaration.length) + node.source;

	error.TypeError = 'CompileError';
	error.nodeName = node.name;
	error.line = content.split(/(?:\r\n)|\r|\n/).length;
	error.char = content
		.substring(Math.max(content.lastIndexOf('\n'), content.lastIndexOf('\r')))
		.lastIndexOf(node.source.replace(/^\s+/, ''));

	this.onError(error);
};

module.exports = Parser;

/**
 * @name TEN.config.namespace
 * @description Префикс пространства имен TEN.
 * @default 'ten'
 * @type string
 */

/**
 * @name TEN.config.templateRoot
 * @description Корневая директория файлов шаблонов, относительно которой будут разрешаться пути.
 * @default ''
 * @type string
 */

/**
 * @name TEN.config.encoding
 * @description Кодировка файлов шаблонов.
 * @default 'utf-8'
 * @type string
 */

/**
 * @name TEN.config.saveComments
 * @description Если значение параметра false - HTML-комментарии будут удалены из результирующего кода шаблона. <a href="http://msdn.microsoft.com/en-us/library/ms537512(v=vs.85).aspx">Условные комментарии Internet Explorer</a> не будут удалены.
 * @default true
 * @type boolean
 */

/**
 * @name TEN.config.parseCDATA
 * @description Если значение парамерта false - теги TEN не будут отрабатывать в секциях CDATA.
 * @default false
 * @type boolean
 */

/**
 * @name TEN.config.tabSize
 * @description Размер одного символа табуляции в пробелах (если используется символ табуляции).
 * @default 2
 * @type number
 */

/**
 * @name TEN.config.indent
 * @description Размер отступа в пробелах.
 * @default 2
 * @type number
 */

/**
 * @name TEN.config.cache
 * @description Разрешить или запретить кешировать скомпилированные шаблоны.
 * @default true
 * @type boolean
 */

/**
 * @name TEN.config.removeXMLDeclaration
 * @description Если значение параметра true - XML декларация и DTD в начале файла шаблона будут удалены.
 * @default true
 * @type boolean
 */

/**
 * @name TEN.config.cacheKey
 * @description Имя ключа, по которому он будет сохранен в кеше {@link TEN.cache}.
 * @default Абсолютный путь к файлу шаблона, по которому он был скомпилирован.
 * @type string
 */

/**
 * @name TEN.config.inheritConfig
 * @description Флаг, указывающий на необходимость наследования кастомного объекта конфигурации {@link TEN.config}. Если значение параметра true - значением по-умолчанию атрибута <i>config</i> тега <i>render</i> будет конфиг текущего шаблона.
 * @default true
 * @type boolean
 */