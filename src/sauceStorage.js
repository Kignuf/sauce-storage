const path = require('path')
const crypto = require('crypto')
const fs = require('fs')
const https = require('https')

const GET_BUILDS_TIMEOUT = 1000 * 15
const UPLOAD_BUILD_TIMEOUT = 1000 * 60 * 3

class SauceStorage {
	constructor(sauceUsername, sauceAccessKey) {
		this.sauceUsername = sauceUsername
		this.sauceAccessKey = sauceAccessKey
	}

	/**
	 * getAppCapabilityForBuild
	 * Upload the build if it is not already stored on sauce storage
	 * Forces the upload if the hashes differ between local and online versions
	 * @param {string} buildPath the path to the build
	 * @returns {Promise} a promise that resolves to the sauce storage string to use in your "app" capability
	 */
	async getAppCapabilityForBuild(buildPath) {
		if (typeof buildPath !== 'string') {
			throw new Error('build should be a string')
		}
		const resolvedBuildPath = path.resolve(buildPath)
		const parsedBuildPath = path.parse(buildPath)

		const results = await Promise.all([
			SauceStorage.getLocalBuildHash(resolvedBuildPath),
			this.getOnlineBuilds(),
		])

		const localBuildHash = results[0]
		const onlineBuilds = results[1]

		if(!onlineBuilds.some(build => build.name === parsedBuildPath.base && build.md5 === localBuildHash)) {
			// Should upload the build
			const uploadResponse = await this.upload(resolvedBuildPath, parsedBuildPath.base)
			if(uploadResponse.md5 !== localBuildHash) {
				throw new Error('Uploaded file hash did not match local file hash')
			}
		}
		return `sauce-storage:${parsedBuildPath.base}`
	}

	/**
	 * getLocalBuildHash
	 * @param {string} buildPath the path to the build
	 * @returns {Promise} resolves to the build's hash
	 */
	static getLocalBuildHash(buildPath) {
		return new Promise((resolve, reject) => {
			const hash = crypto.createHash('md5')
			let fileStream
			try {
				fileStream = fs.createReadStream(buildPath)
			} catch (e) {
				return reject(e)
			}
			fileStream.on('error', err => reject(err))
			fileStream.on('data', chunck => hash.update(chunck))
			fileStream.on('end', () => resolve(hash.digest('hex')))
		})
	}

	/**
	 * getOnlineBuilds
	 * Get the list of builds currently available on your sauce storage
	 * @returns {Promise} resolves to an array of objects representing
	 * files available on sauce storage
	 */
	getOnlineBuilds() {
		return new Promise((resolve, reject) => {
			const req = https.get({
				hostname: 'saucelabs.com',
				path: `/rest/v1/storage/${this.sauceUsername}`,
				auth: `${this.sauceUsername}:${this.sauceAccessKey}`,
			})

			req
				.setTimeout(GET_BUILDS_TIMEOUT, () => {
					req.abort()
					reject(new Error(`Request did not complete within ${GET_BUILDS_TIMEOUT}ms`))
				})
				.on('error', (err) => {
					reject(err)
				})
				.on('aborted', () => {
					reject(new Error('Aborted'))
				})
				.on('response', (res) => {
					if (res.statusCode !== 200) {
						return reject(new Error(`Status = ${res.statusCode}`))
					} else {
						let buffer = Buffer.alloc(parseInt(res.headers['content-length']))
						res
							.on('data', (chunk) => {
								buffer.write(chunk.toString('utf-8'))
							})
							.on('end', () => {
								let payload
								try {
									payload = JSON.parse(buffer.toString())
								} catch (e) {
									return reject(e)
								}
								if (payload.files) {
									return resolve(payload.files)
								} else {
									return reject(new Error('Payload does not have "file" property'))
								}
							})
							.on('close', () => {
								reject(new Error('connection closed'))
							})
					}
				})
		})
	}

	/**
	 * upload
	 * Uploads a build to sauce storage
	 * @param {String} buildPath the path to build file
	 * @param {String} buildName the name it will be saved as
	 * @param {Integer} timeout the upload timeout, in ms
	 * @returns {Promise} resolves when it's done
	 */
	upload(buildPath, buildName, timeout = UPLOAD_BUILD_TIMEOUT) {
		return new Promise((resolve, reject) => {
			let buildStream
			try {
				// Prepare the local file stream
				buildStream = fs.createReadStream(buildPath)
			} catch(e) {
				return reject(e)
			}

			// Prepare the upload request
			const uploadRequest = https.request({
				hostname: 'saucelabs.com',
				path: `/rest/v1/storage/${this.sauceUsername}/${buildName}?overwrite=true`,
				method: 'POST',
				headers: { 'content-type': 'application/octet-stream' },
				auth: `${this.sauceUsername}:${this.sauceAccessKey}`,
			})

			// Perform the upload
			uploadRequest
				.setTimeout(timeout, () => {
					uploadRequest.abort()
					reject(new Error(`Could not complete upload within ${timeout}ms`))
				})
				.on('aborted', () =>
					reject(new Error('Upload aborted'))
				)
				.on('error', (e) => {
					reject(e)
				})
				.on('response', (res) => {
					let buffer = Buffer.alloc(parseInt(res.headers['content-length']))
					res
						.on('data', (chunk) => {
							buffer.write(chunk.toString('utf-8'))
						})
						.on('end', () => {
							let payload
							try {
								payload = JSON.parse(buffer.toString())
							} catch(e) {
								return reject(e)
							}

							if(res.statusCode !== 200) {
								if(payload.errors) {
									payload.statusCode = res.statusCode
									return reject(payload)
								} else {
									return reject(new Error(`Upload failed with status ${res.statusCode}`))
								}
							} else {
								return resolve(payload)
							}
						})
				})

				// Pipe the local file stream to the POST request
				buildStream.pipe(uploadRequest)
		})
	}
}

module.exports = SauceStorage
