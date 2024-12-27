IDECL - IDE for Classrooms
==========================

This is a (very early stage work-in-progress) IDE for use by teachers teaching AP CS or other Java courses (and eventually other languages as well).  Based on experience with the now-retired Replit for Education and other systems, this is meant to initially be a relatively minimal system providing only what is needed for a class: assignments, auto grading with unit tests, and associated UI to make them useful and usable.

Notably, this is not meant to be used outside of classrooms or at large-scale; it doesn't have any way to run services and expose them to the internet, no graphics, and is meant to be run on a single host (with appropriate backups), so a single instance likely won't scale beyond 20-50-ish students.  However, that simplicity means that it can be quick and resource-light; the goal is to be able to support a class of 20 reasonably on a $4.00/mo Digital Ocean Droplet, or comfortably on a slighly larger host.  (Note that, unlike most existing systems, that's not $4.00/student; that's $4.00/class.  Hopefully at the point where a teacher can pay for it out of pocket or easily get it approved by their school).

### Roadmap:

Milestone 1: PoC running Java on the server
- [X] Edit and Main.java and Num.java
- [X] Run the files on a server
- [X] Send input to the running Java program.

Milestone 2: Usable for writing unit tests to copy to another platform.
- [X] True multi-file editing, including storing files in localStorage
- [X] Authentication
- [X] Basic host security
  - [X] sandboxing programs
  - [ ] stdin restricted to known pids (this should show up for free later?
- [X] Unit test creation and running.

Milestone 2.5?: UX
- [X] Real text editor (Monaco?  CodeMirror? **ace.c9.io?**)
- [X] Inline text entry for stdin; terminal emulator? (**xtermjs**? terminal.js)
- [ ] Maybe some pretty.  Maybe keep the simple style.
- [X] Directories for files

Milestone 3: A real server
- [X] Use a real python server, ~ideally evented~, to support multiple simultaneous users
- [X] Use nginx as frontend and for and static assets
- [X] Reasonable Deployment
- [X] TLS (Let's Encrypt)
- [X] Store files server-side tied to user account
- [X] Database migrations

Milestone 4: Projects
- [X] Sharing code across users
- [X] Starter code/template for the project
  - [X] Via generalized forking; files can be editable, hidden, or ignored, and static or updated.  (Also useful for copying projects year to year)
- [X] Tests
  - [ ] Points assigned to each test.
- [ ] Solution for testing tests/giving to students after
- [ ] UI for managing all of this

Milestone 5: MVP Classroom
- [X] Student management/invites
  - [X] Basic RBAC
- [ ] Better security
  - [X] enforced timeouts (time for compile, CPU for program)
  - [ ] queueing compiles to avoid OOM
  - [X] block Internet access
- [X] View student code
- [X] Cache builds for quick reruns (nix? bazel? manual hashing?) (maybe next milestone?)
- [X] Backups (S3 via litestream)
- [ ] Import/export of some sort
- [X] Detect stdin usage on tests
- [X] Don't load hidden files into the client.

Milestone 6: Full classroom
- [ ] History to help detect cheating
- [ ] UI to show student status, easily look at code
- [X] Hide tests or other files from students
- [ ] Hide implementation of specific methods from students
- [ ] Assignment (markdown) within the platform
- [ ] Ability to pull in libraries
- [ ] Dark mode
- [X] View as student (sudo? Associated student?)
- [ ] Live shared editing
  - [ ] With shared cursors (https://github.com/convergencelabs/ace-collab-ext)
- [ ] Comments on code/chat on project
- [ ] Emails for invites, assignments?
- [ ] Solution for updating published projects
  - [ ] Overwrite student code
    - [ ] Only if student hasn't updated it (e.g., better starter code)
    - [ ] Give student option (or note that history saved old copy)

Milestone 6b: Deployable
- [ ] "One button" deploy on Digital Ocean or other cheap cloud
- [ ] Web UI configuration for things like backups
- [ ] Documentation
- [ ] DNS of some sort
  - [ ] Teachers register via oauth against allowlist, get token for update?
  - [ ] custom DNS? NFS?
  - [ ] if custom, detect when host down, provide useful error?

Milestone 7: "Real product"
- [ ] API
- [ ] Mobile interface
- [ ] Custom run/compile commands
- [ ] Cost savings: spin down VM when not in use?
  - [ ] Lambda with core logic, spin up VM if multiple students active at the same time?
- [ ] Scaling: spin up more/bigger VM's for high demand or serve out to Lambda (may be milestone 5/6?)
- [ ] Other languages
- [ ] One-click app-updating
- [ ] Expose generalized forking to users to customize how they write assignments and maybe other stuff too.
- [ ] UI for RBAC to give more granular control than "user" and "teacher"
- [ ] Shell access inside containers

Milestone 8(?): Fully offline work
- [ ] SPA to load once
- [ ] Buffer updates to send to server
- [ ] Smart diff for conflicting updates
- [ ] Running code client-side with CheerpJ/CheerpX/V86
- [ ] Handle multiple users locally within reason

Bonus:
- [ ] Cheating detection (MOSS, behavior like typing a lot with no backspaces)
- [ ] Integration with github for storing student code
- [ ] Persistent filesystem/container per student (maybe in a milestone?  Not sure if this is needed)
- [ ] Performance optimizations
  - [ ] Domain/cookie?
  - [ ] Version in cookie so first load includes updated files?
- [ ] Switch to CodeMirror for better support?
- [ ] Figure out why Docker is slow and fix or replace it.
  - [ ] Looks like it's container startup; execing in an existing one is fast.  So a container pool, or container per student...  Or not docker.
- [ ] Run transforms on code before running tests (e.g., use sed to modify a class constant)
- [ ] Grading with inline comemnts like Github PRs.
  - [ ] Auto-template similar comments, and assign consistent scores.
- [ ] Merging multiple streams of changes (including post-publish project changes)
  - [ ] Automatically for unmodified pieces of code (e.g., a method the student hasn't touched)
  - [ ] Allow student to choose which side to keep.
