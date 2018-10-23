const path = require('path'),
	proxyRoot = path.join(__dirname, '../../../../..'),
	Settings = require('./settings')

const kSettings = Symbol()

class DispatchWrapper {
	constructor(dispatch, namespace) {
		this.dispatch = dispatch
		this.name = this.namespace = namespace

		this.require = new Proxy(Object.create(null), {
			get: (obj, key) => {
				const mods = this.dispatch.modules
				if(!mods.has(key))
					try {
						this.dispatch.load(key, require(proxyRoot + '/bin/node_modules/' + key))
					}
					catch(e) {}
				if(!mods.has(key)) throw Error(`Required mod not found: ${key}`)
				return mods.get(key)
			},
			set() { throw TypeError('Cannot set property of require')}
		})

		this[kSettings] = new Settings(path.join(proxyRoot, 'settings', this.namespace + '.json'), this.namespace)
	}

	get settings() { return this[kSettings].root }
	set settings(obj) {
		this[kSettings].loadRoot(obj)
		this[kSettings].changed()
	}

	load(name, from, required = true, ...args) {
		const mod = this.dispatch.load(name, from, ...args)
		if(required && !mod) throw Error(`Cannot find module '${name}'`)
		return mod
	}

	unload(...args) { return this.dispatch.unload(...args) }

	hook(...args) { return this.dispatch.hook(this.namespace, ...args) }

	hookOnce(...args) {
		const cb = args.pop()
		if(typeof cb !== 'function') throw Error('last argument not a function')

		const dispatch = this.dispatch
		return this.hook(...args, function(...hookArgs) {
			dispatch.unhook(this)
			return cb.call(this, ...hookArgs)
		})
	}

	hookAsync(...args) {
		return new Promise((resolve, reject) => {
			this.hookOnce(...args, event => {
				if(event) resolve(event)
				else reject(Error('Hook timed out'))
			})
		})
	}

	unhook(...args) { return this.dispatch.unhook(...args) }

	send(name, version, data) {
		if(typeof name !== 'string') throw Error('Raw send() is not supported')

		switch(name[0]) {
			case 'C':
				return this.dispatch.write(true, name, version, data)
				break
			case 'I':
			case 'S':
				return this.dispatch.write(false, name, version, data)
				break
			default:
				throw Error(`Unknown packet direction: ${name}`)
		}
	}

	toClient(...args) { return this.dispatch.write(false, ...args) }
	toServer(...args) { return this.dispatch.write(true, ...args) }

	parseSystemMessage(...args) { return this.dispatch.parseSystemMessage(...args) }
	buildSystemMessage(...args) { return this.dispatch.buildSystemMessage(...args) }

	get region() { return this.dispatch.region }
	get patchVersion() { return this.dispatch.majorPatchVersion + this.dispatch.minorPatchVersion / 100 }
	get majorPatchVersion() { return this.dispatch.majorPatchVersion }
	get minorPatchVersion() { return this.dispatch.minorPatchVersion }

	// Deprecated
	get base() { return this.dispatch }
	get command() { return this.require.command }
	get game() { return this.require['tera-game-state'] }
}

module.exports = DispatchWrapper