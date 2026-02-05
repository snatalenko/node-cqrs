import { defineConfig, globalIgnores } from "eslint/config";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import jestPlugin from 'eslint-plugin-jest';
import globals from "globals";

export default defineConfig([
	globalIgnores([
		"coverage/*",
		"dist/*",
		"types/*"
	]),
	{
		files: [
			"**/*.ts"
		],
		languageOptions: {
			parser: tsParser,
			globals: {
				...globals.node,
				NodeJS: true
			}
		},
		plugins: {
			"@typescript-eslint": tsPlugin,
		},
		"rules": {
			"no-use-before-define": "warn",
			"strict": "off",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					"vars": "local",
					"args": "after-used",
					"ignoreRestSiblings": true,
					"argsIgnorePattern": "^(_|err)"
				}
			],
			"padding-line-between-statements": [
				"warn",
				{
					"blankLine": "always",
					"prev": "if",
					"next": "return"
				},
				{
					"blankLine": "any",
					"prev": "block-like",
					"next": "return"
				},
				{
					"blankLine": "always",
					"prev": "if",
					"next": "const"
				},
				{
					"blankLine": "any",
					"prev": "block-like",
					"next": "const"
				}
			],
			"nonblock-statement-body-position": [
				"error",
				"below"
			],
			"array-callback-return": "error",
			"block-scoped-var": "error",
			"class-methods-use-this": "warn",
			"consistent-return": "error",
			"curly": [
				"error",
				"multi-or-nest",
				"consistent"
			],
			"default-case": [
				"error",
				{
					"commentPattern": "^no default$"
				}
			],
			"dot-notation": [
				"error",
				{
					"allowKeywords": true
				}
			],
			"dot-location": [
				"error",
				"property"
			],
			"eqeqeq": [
				"error",
				"allow-null"
			],
			"guard-for-in": "error",
			"no-alert": "error",
			"no-caller": "error",
			"no-case-declarations": "error",
			"no-empty-function": [
				"error",
				{
					"allow": [
						"arrowFunctions",
						"methods",
						"getters"
					]
				}
			],
			"no-empty-pattern": "error",
			"no-eval": "error",
			"no-extend-native": "error",
			"no-extra-bind": "error",
			"no-extra-label": "error",
			"no-fallthrough": "error",
			"no-floating-decimal": "error",
			"no-global-assign": [
				"error",
				{
					"exceptions": []
				}
			],
			"no-implied-eval": "error",
			"no-iterator": "error",
			"no-labels": [
				"error",
				{
					"allowLoop": false,
					"allowSwitch": false
				}
			],
			"no-lone-blocks": "error",
			"no-loop-func": "error",
			"no-multi-spaces": "error",
			"no-multi-str": "error",
			"no-new": "error",
			"no-new-func": "error",
			"no-new-wrappers": "error",
			"no-octal": "error",
			"no-octal-escape": "error",
			"no-proto": "error",
			"no-redeclare": "error",
			"no-restricted-properties": [
				"error",
				{
					"object": "arguments",
					"property": "callee",
					"message": "arguments.callee is deprecated"
				},
				{
					"property": "__defineGetter__",
					"message": "Please use Object.defineProperty instead."
				},
				{
					"property": "__defineSetter__",
					"message": "Please use Object.defineProperty instead."
				},
				{
					"object": "Math",
					"property": "pow",
					"message": "Use the exponentiation operator (**) instead."
				}
			],
			"no-return-assign": "error",
			"no-return-await": "error",
			"no-script-url": "error",
			"no-self-assign": "error",
			"no-self-compare": "error",
			"no-sequences": "error",
			"no-throw-literal": "error",
			"no-unused-labels": "error",
			"no-useless-concat": "error",
			"no-useless-escape": "error",
			"no-useless-return": "error",
			"no-void": [
				"warn",
				{ "allowAsStatement": true }
			],
			"no-warning-comments": [
				"warn",
				{
					"terms": ["todo", "fixme", "hack"],
					"location": "start"
				}
			],
			"no-with": "error",
			"radix": "error",
			"vars-on-top": "error",
			"wrap-iife": [
				"error",
				"outside",
				{
					"functionPrototypeMethods": false
				}
			],
			"yoda": "error",
			"no-mixed-requires": "error",
			"global-require": "error",
			"no-new-require": "error",
			"no-path-concat": "error",
			"arrow-body-style": [
				"error",
				"as-needed"
			],
			"arrow-parens": [
				"error",
				"as-needed"
			],
			"arrow-spacing": [
				"error",
				{
					"before": true,
					"after": true
				}
			],
			"constructor-super": "error",
			"generator-star-spacing": [
				"error",
				{
					"before": false,
					"after": true
				}
			],
			"no-class-assign": "error",
			"no-confusing-arrow": [
				"error",
				{
					"allowParens": true
				}
			],
			"no-const-assign": "error",
			"no-dupe-class-members": "error",
			"no-duplicate-imports": "error",
			"no-new-symbol": "error",
			"no-this-before-super": "error",
			"no-useless-computed-key": "error",
			"no-useless-constructor": "error",
			"no-useless-rename": [
				"error",
				{
					"ignoreDestructuring": false,
					"ignoreImport": false,
					"ignoreExport": false
				}
			],
			"no-var": "error",
			"object-shorthand": [
				"error",
				"always",
				{
					"ignoreConstructors": false,
					"avoidQuotes": true
				}
			],
			"prefer-const": [
				"error",
				{
					"destructuring": "any",
					"ignoreReadBeforeAssign": true
				}
			],
			"prefer-numeric-literals": "error",
			"prefer-rest-params": "error",
			"prefer-spread": "error",
			"prefer-template": "error",
			"require-yield": "error",
			"rest-spread-spacing": [
				"error",
				"never"
			],
			"symbol-description": "error",
			"template-curly-spacing": "error",
			"yield-star-spacing": [
				"error",
				"after"
			],
			"comma-dangle": [
				"error",
				"never"
			],
			"no-cond-assign": [
				"error",
				"always"
			],
			"no-console": "error",
			"no-constant-condition": "error",
			"no-control-regex": "error",
			"no-debugger": "error",
			"no-dupe-args": "error",
			"no-dupe-keys": "error",
			"no-duplicate-case": "error",
			"no-empty": "error",
			"no-empty-character-class": "error",
			"no-ex-assign": "error",
			"no-extra-boolean-cast": "error",
			"no-extra-semi": "error",
			"no-func-assign": "error",
			"no-inner-declarations": "error",
			"no-invalid-regexp": "error",
			"no-irregular-whitespace": "error",
			"no-obj-calls": "error",
			"no-prototype-builtins": "error",
			"no-regex-spaces": "error",
			"no-sparse-arrays": "error",
			"no-template-curly-in-string": "error",
			"no-unexpected-multiline": "error",
			"no-unsafe-finally": "error",
			"no-unsafe-negation": "error",
			"use-isnan": "error",
			"valid-typeof": [
				"error",
				{
					"requireStringLiterals": true
				}
			],
			"array-bracket-spacing": [
				"error",
				"never"
			],
			"block-spacing": [
				"error",
				"always"
			],
			"brace-style": [
				"error",
				"stroustrup",
				{
					"allowSingleLine": false
				}
			],
			"camelcase": [
				"error",
				{
					"properties": "never"
				}
			],
			"comma-spacing": [
				"error",
				{
					"before": false,
					"after": true
				}
			],
			"comma-style": [
				"error",
				"last"
			],
			"computed-property-spacing": [
				"error",
				"never"
			],
			"eol-last": [
				"error",
				"always"
			],
			"func-call-spacing": [
				"error",
				"never"
			],
			"indent": [
				"error",
				"tab",
				{
					"SwitchCase": 1,
					"VariableDeclarator": 1,
					"outerIIFEBody": 1,
					"FunctionDeclaration": {
						"parameters": 1,
						"body": 1
					},
					"FunctionExpression": {
						"parameters": 1,
						"body": 1
					}
				}
			],
			"key-spacing": [
				"error",
				{
					"beforeColon": false,
					"afterColon": true
				}
			],
			"keyword-spacing": [
				"error",
				{
					"before": true,
					"after": true,
					"overrides": {
						"return": {
							"after": true
						},
						"throw": {
							"after": true
						},
						"case": {
							"after": true
						}
					}
				}
			],
			"linebreak-style": [
				"error",
				"unix"
			],
			"lines-around-comment": [
				"error",
				{
					"beforeBlockComment": true,
					"afterBlockComment": false,
					"beforeLineComment": true,
					"afterLineComment": false,
					"allowBlockStart": true,
					"allowObjectStart": true,
					"allowArrayStart": true
				}
			],
			"lines-around-directive": [
				"error",
				{
					"before": "never",
					"after": "always"
				}
			],
			"max-len": [
				"warn",
				120,
				4,
				{
					"ignoreUrls": true,
					"ignoreComments": false,
					"ignoreRegExpLiterals": true,
					"ignoreStrings": true,
					"ignoreTemplateLiterals": true
				}
			],
			"max-params": [
				"warn",
				5
			],
			"new-cap": [
				"error",
				{
					"newIsCap": true,
					"newIsCapExceptions": [],
					"capIsNew": false,
					"capIsNewExceptions": [
						"Immutable.Map",
						"Immutable.Set",
						"Immutable.List"
					]
				}
			],
			"new-parens": "error",
			"newline-per-chained-call": [
				"error",
				{
					"ignoreChainWithDepth": 4
				}
			],
			"no-array-constructor": "error",
			"no-bitwise": "error",
			"no-lonely-if": "error",
			"no-mixed-operators": [
				"error",
				{
					"groups": [
						[
							"+",
							"-",
							"*",
							"/",
							"%",
							"**"
						],
						[
							"&",
							"|",
							"^",
							"~",
							"<<",
							">>",
							">>>"
						],
						[
							"==",
							"!=",
							"===",
							"!==",
							">",
							">=",
							"<",
							"<="
						],
						[
							"&&",
							"||"
						],
						[
							"in",
							"instanceof"
						]
					],
					"allowSamePrecedence": true
				}
			],
			"no-mixed-spaces-and-tabs": "error",
			"no-multiple-empty-lines": [
				"error",
				{
					"max": 2,
					"maxEOF": 1
				}
			],
			"no-nested-ternary": "error",
			"no-new-object": "error",
			"no-restricted-syntax": [
				"error",
				"ForInStatement",
				"LabeledStatement",
				"WithStatement"
			],
			"no-spaced-func": "error",
			"no-trailing-spaces": "error",
			"no-unneeded-ternary": [
				"error",
				{
					"defaultAssignment": false
				}
			],
			"no-whitespace-before-property": "error",
			"object-curly-spacing": [
				"error",
				"always"
			],
			"object-property-newline": [
				"error",
				{
					"allowMultiplePropertiesPerLine": true
				}
			],
			"one-var": [
				"error",
				"never"
			],
			"one-var-declaration-per-line": [
				"error",
				"always"
			],
			"operator-assignment": [
				"error",
				"always"
			],
			"quote-props": [
				"error",
				"as-needed",
				{
					"keywords": false,
					"unnecessary": true,
					"numbers": false
				}
			],
			"quotes": [
				"error",
				"single",
				{
					"avoidEscape": true
				}
			],
			"semi": [
				"error",
				"always"
			],
			"semi-spacing": [
				"error",
				{
					"before": false,
					"after": true
				}
			],
			"sort-vars": "off",
			"space-before-blocks": "error",
			"space-before-function-paren": [
				"error",
				{
					"anonymous": "always",
					"named": "never",
					"asyncArrow": "always"
				}
			],
			"space-in-parens": [
				"error",
				"never"
			],
			"space-infix-ops": "error",
			"space-unary-ops": [
				"error",
				{
					"words": true,
					"nonwords": false,
					"overrides": {}
				}
			],
			"spaced-comment": [
				"error",
				"always",
				{
					"line": {
						"exceptions": [
							"-",
							"+"
						],
						"markers": [
							"/",
							"=",
							"!"
						]
					},
					"block": {
						"exceptions": [
							"-",
							"+"
						],
						"markers": [
							"=",
							"!"
						],
						"balanced": false
					}
				}
			],
			"unicode-bom": [
				"error",
				"never"
			],
			"wrap-regex": "off",
			"init-declarations": "off",
			"no-catch-shadow": "off",
			"no-delete-var": "error",
			"no-label-var": "error",
			"no-restricted-globals": "off",
			"no-shadow": "error",
			"no-shadow-restricted-names": "error",
			"no-undef": "error",
			"no-undef-init": "error",
			"no-undefined": "off"
		}
	}, {
		files: [
			'tests/**/*.ts'
		],
		plugins: {
			jest: jestPlugin,
		},
		languageOptions: {
			globals: jestPlugin.environments.globals.globals,
		},
		rules: {
			'jest/no-disabled-tests': 'warn',
			'jest/no-focused-tests': 'error',
			'jest/no-identical-title': 'error',
			'jest/prefer-to-have-length': 'warn',
			'jest/valid-expect': 'error',
			'class-methods-use-this': 'off',
			'no-loop-func': 'off',
			'no-return-assign': 'off',
			'no-console': 'off'
		}
	}
]);
