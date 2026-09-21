# SPIKE Keyboard Controller Project Instructions

## Project goal

This project is a portable LEGO SPIKE Prime keyboard controller intended to be shared with other students.

Changes must improve the project itself rather than relying on a particular developer's computer, installed packages, configuration, or environment.

The project should work on other supported Macs using the same repository or a properly built release.

---

## Portability is a core requirement

Never assume that software installed on the developer's computer is available on another computer.

When fixing a problem, prefer changing the project, build process, or packaging so the fix applies to everyone.

Avoid:

- Developer-specific file paths
- User-specific configuration
- Global Python packages
- Global system configuration
- Packages that are not declared by the project
- Assuming a particular working directory
- Assuming development tools are installed
- Making a fix that only works on the computer being used for testing

A solution is not considered properly portable if it only works because the current computer has been specially configured.

---

## Dependency policy

Do **not** install dependencies onto the computer being used for testing merely to make an error disappear.

In particular, do not automatically run:

- `pip install`
- `pip3 install`
- `brew install`
- System-wide package installers
- Commands that modify the global Python environment
- Commands that modify system-wide configuration

If a missing dependency is encountered:

1. Check whether it is already declared in the project's dependency or build configuration.
2. Determine whether the dependency is genuinely required.
3. Check whether the problem can reasonably be fixed in the project itself.
4. Check whether the dependency can be bundled into the distributable application.
5. Check whether the build process can provide the required component.
6. Consider whether an appropriate fallback or alternative implementation exists.

Do not silently install a dependency simply because doing so makes the current error disappear.

Do not add unnecessary dependencies.

---

## Environment errors

Errors caused by the current computer's Python installation, operating system configuration, or globally installed software should not immediately be solved by modifying the computer.

First investigate whether the project can:

- Use functionality already available to supported users
- Change its implementation
- Use a different standard-library or project-supported approach
- Bundle the required runtime or component
- Modify its build process
- Provide an appropriate fallback
- Detect and report an unsupported environment clearly

For example, if a standard-library module imports successfully but one of its compiled components is missing, investigate whether the issue is with the Python distribution, the build process, or the application's packaging before telling the user to modify their computer.

A different import is acceptable if it is genuinely a better and supported implementation for the project.

Do **not** change an import merely to bypass an error if the replacement introduces an undocumented dependency or loses existing functionality.

Only change the local environment when there is a documented reason that the project itself cannot reasonably provide, avoid, or bundle the requirement.

---

## Important distinction: development vs distribution

A dependency being required by the source code does not necessarily mean every user should manually install it.

This project has a distribution/build system. When possible, dependencies required by the application should be included in the appropriate distributable build.

The goal is:

> Users should be able to run the distributed application without having to reproduce the developer's development environment.

Do not remove a legitimate dependency merely because it is external.

For example, Bluetooth communication and keyboard input may require external libraries. If such a library is genuinely necessary, preserve the functionality and investigate whether it can be included in the application's distribution.

---

## Testing rules

When debugging, treat the current computer as a potentially different or incomplete environment.

Before declaring a fix successful, consider:

- Does the fix work from a clean environment?
- Does it depend on something installed globally?
- Is the dependency declared in the repository?
- Would another student's Mac have the same requirement?
- Does the distributed version contain everything it needs?
- Does the fix work without special configuration on the developer's machine?

A successful test on one computer does not automatically prove that the project is portable.

When possible, test using an environment that resembles what a classmate would have.

---

## Make fixes reusable

When fixing an error, prefer solutions such as:

- Correcting the project's Python code
- Correcting imports
- Correcting incorrect assumptions about the platform
- Updating project configuration
- Updating `requirements.txt` when a dependency is genuinely required
- Updating build scripts
- Bundling required dependencies into releases
- Bundling required runtime components where appropriate
- Adding graceful error handling
- Detecting unsupported environments and explaining the problem clearly
- Providing a supported fallback when practical

The fix should live in the repository or its build/distribution process whenever reasonably possible.

---

## Repository-first debugging

When an error occurs, inspect the repository before changing the environment.

Check relevant:

- Source files
- `requirements.txt`
- Build scripts
- `setup.py`
- README instructions
- Existing release configuration
- Import structure
- Platform assumptions
- Python version requirements
- Existing web/desktop alternatives

Do not assume that an error should be fixed by installing something.

First determine **why** the error occurs and whether the repository can address it.

---

## Dependency changes

Before adding a new dependency:

1. Determine whether the standard library can reasonably provide the required functionality.
2. Check whether the repository already contains an equivalent solution.
3. Check whether an existing dependency can provide the functionality.
4. Consider the effect on portability and distribution size.
5. Determine whether the dependency can be bundled into the release.
6. Only then consider adding the dependency.

Do not add a dependency solely because it is convenient for development.

If a dependency is genuinely required, document it appropriately.

---

## Platform compatibility

This project is primarily intended for supported macOS systems.

Do not assume that all Macs have identical Python installations.

In particular, do not assume:

- A specific Python distribution
- A specific Python version
- Homebrew is installed
- Python was installed through Homebrew
- Tk or other optional runtime components are present
- Global Python packages are present
- Developer tools are installed

If a feature depends on a platform component, make the requirement explicit and investigate whether the component can be bundled or provided by the project's build process.

---

## Preserve existing functionality

Do not make large architectural changes solely to remove a dependency.

Before replacing a dependency or rewriting a subsystem, determine what functionality it provides and whether the replacement would preserve the application's behaviour.

In particular, preserve:

- LEGO SPIKE Prime hub communication
- Bluetooth functionality
- Keyboard controls
- The desktop GUI
- The web version
- Existing build and release workflows

Prefer the smallest reliable change that solves the actual problem.

A portability improvement is not useful if it breaks the application.

---

## Do not hide problems

If the project genuinely requires something that cannot reasonably be bundled, replaced, or avoided, clearly explain:

- What is required
- Why it is required
- Which part of the application uses it
- Whether it can be bundled into the release
- Whether it should be documented as a user requirement
- What alternatives were considered

Do not pretend that the project is portable when it still depends on undocumented software or configuration.

---

## Do not optimise for the current machine

The current computer is a testing environment, not the definition of what the project requires.

Do not make project decisions based solely on:

> "It works on this computer."

Instead ask:

> "Will this change make the project work correctly for other supported users?"

If a solution requires something to be installed or configured only on the current computer, treat that as a warning sign and investigate a project-level solution first.

---

## Build and release awareness

Before changing dependencies or architecture, inspect the existing build and release process.

Prefer improving the existing distribution system over creating an entirely separate installation process.

If the source application requires dependencies that users should not have to install manually, investigate whether the existing build system can package them.

Do not remove working build scripts or release mechanisms without understanding their purpose.

---

## Web and desktop versions

This project contains both desktop and web functionality.

When investigating a desktop-specific problem, check whether the functionality already has a web implementation before creating a completely new solution.

However, do not replace desktop functionality with the web version unless that preserves the intended user experience and hardware functionality.

The two versions may have different platform requirements.

---

## Safety rule for automated changes

Do not make destructive or irreversible system changes to solve a project error.

Do not:

- Modify system-wide configuration unnecessarily
- Delete unrelated user files
- Remove installed software
- Change global Python installations
- Change unrelated projects
- Overwrite unrelated configuration

Keep changes scoped to the project whenever possible.

---

## When blocked

If the project cannot work correctly in the current environment without an external dependency or system component:

1. Identify the exact requirement.
2. Explain why it is required.
3. Determine whether it can be bundled.
4. Determine whether the build system can provide it.
5. Determine whether a supported alternative exists.
6. If no reasonable project-level solution exists, clearly explain the limitation.

Do not install the requirement automatically.

Ask before making changes outside the repository when they are genuinely necessary.

---

## Change priority

When deciding how to fix a problem, use this priority:

1. **Fix the project itself.**
2. **Fix the project's build or packaging process.**
3. **Use an already-declared project dependency correctly.**
4. **Add a dependency only when it is genuinely necessary.**
5. **Require manual environment changes only when there is no reasonable project-level solution.**

The objective is not merely to make the program run on the current computer.

The objective is to make the **project itself better, more portable, and easier for other students to use.**