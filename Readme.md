# Introduction
This package is for saucelabs users. It lets you upload files from your local computer to sauce storage. For more information about sauce storage, [please read here](https://wiki.saucelabs.com/display/DOCS/Temporary+Storage+Methods).

* only proceed to upload if there is currently no build with the same name and hash on your sauce-storage
* returns the string to use in your *app* capability ("sauce-storage:mybuild.apk")

# Installation

```bash
npm i sauce-storage
```

# How to use
Promise is the only available interface, callback is not supported:
```javascript
const sauceStorage = require('sauce-storage')
const storage = new sauceStorage('mySauceUsername', 'mySauceAccessKey')

// Within an async function
const appCap = await storage.getAppCapabilityForBuild('./builds/myapp.apk')

// Promise
storage.getAppCapabilityForBuild('./builds/myapp.apk')
	.then(app => {
		// do something with app
	})
```

For [webdriverio](http://webdriver.io) users, you may add the app capability using the onPrepare hook (which will wait for the promise to resolve, and hence can be async):
```javascript
async function onPrepare (config, capabilities) {
	const app = await storage.getAppCapabilityForBuild('./builds/myapp.apk')
	capabilities.forEach(cap => cap.app = app)
}
```

# Contributing
Contributions are welcome, but please be aware that:
* I built the project without any dependencies in an effort to learn more about the nodejs API
* I want to keep the project's scope small. It solves just one problem and that is all I want it to do for the moment
* There is currently no tests