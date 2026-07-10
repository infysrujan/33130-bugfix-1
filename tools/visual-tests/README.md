# Visual Regression Testing Setup & Workflow


### Prerequisites
* **Docker**: Installed and running. 
* **Node.js**: Node.js 18+ (LTS recommended).
* **Git**: Installed and configured.
* **Repository**: Cloned locally, with the latest code.

---
### Follow the given link for the detailed instructions
* https://documentation--aem-visual-checker--acs-ui.aem.page/tools/visual-tests/developer-onboarding.html

---

### Command for single block snapshot updates


---
### Husky file to be added
* **step 1:** Go to .husky folder.
* **step 2:** Open '_' folder.
* **step 3:** Create '.husky' file.
* **step 4:** Add the following content to the file:
```
#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  debug () {
    if [ "$HUSKY_DEBUG" = "1" ]; then
      echo "husky (debug) - $1"
    fi
  }

  readonly hook_name="$(basename -- "$0")"
  debug "starting $hook_name..."

  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY env variable is set to 0, skipping hook"
    exit 0
  fi

  if [ -f ~/.huskyrc ]; then
    debug "sourcing ~/.huskyrc"
    . ~/.huskyrc
  fi

  readonly husky_skip_init=1
  export husky_skip_init
  sh -e "$0" "$@"
  exitCode="$?"

  if [ $exitCode != 0 ]; then
    echo "husky - $hook_name hook exited with code $exitCode (error)"
  fi

  if [ $exitCode = 127 ]; then
    echo "husky - command not found in PATH=$PATH"
  fi

  exit $exitCode
fi

```
---

### Commands to be used
- Most of the time will use the docker commands.
- To generate the snapshots use
```
npm run test:visual:generate
```

- To update the snapshots
```
npm run test:visual:docker:update
```

- To run the tests
```
npm run test:visual:docker

```
- To update single block snapshot use
```
npm run test:visual:docker:update --blocks/<name>

```

### Before commit ensure to run in the terminal
```
npm start
```