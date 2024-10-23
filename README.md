IDECL - IDE for Classrooms
==========================

This is a (very early stage work-in-progress) IDE for use by teachers teaching AP CS or other Java courses (and eventually other languages as well).  Based on experience with the now-retired Replit for Education and other systems, this is meant to initially be a relatively minimal system providing only what is needed for a class: assignments, auto grading with unit tests, and associated UI to make them useful and usable.

Notably, this is not meant to be used outside of classrooms or at large-scale; it doesn't have any way to run services and expose them to the internet, no graphics, and is meant to be run on a single host (with appropriate backups), so a single instance likely won't scale beyond 20-50-ish students.  However, that simplicity means that it can be quick and resource-light; the goal is to be able to support a class of 20 reasonably on a $4.00/mo Digital Ocean Droplet, or comfortably on a slighly larger host.  (Note that, unlike most existing systems, that's not $4.00/student; that's $4.00/class.  Hopefully at the point where a teacher can pay for it out of pocket or easily get it approved by their school).

Roadmap:

Milestone 1: PoC running Java on the server
- [X] Edit and Main.java and Num.java
- [X] Run the files on a server
- [X] Send input to the running Java program.

Milestone 2: Usable for writing unit tests to copy to another platform.
- [X] True multi-file editing, including storing files in localStorage
- [X] Authentication
- [] Basic host security
  - [] sandboxing programs
- [] Unit test creation and running.

Milestone 2.5?: UX
- [] Real text editor (Monaco?  **CodeMirror**? ace.c9.io?)
- [] Inline text entry for stdin; terminal emulator? (xtermjs? terminal.js)
- [] Maybe some pretty.  Maybe keep the simple style.

Milestone 3: A real server
- [] Use a real python server, ideally evented, to support multiple simultaneous users
- [] Reasonable Deployment
- [] Store files server-side

Milestone 4: Projects
- [] Starter code/template for the project
- [] Tests
- [] Solution for testing tests/giving to students after

Milestone 5: MVP Classroom
- [] Student management/invites
  - Basic RBAC
- [] Better security
  - [] enforced timeouts (time for compile, CPU for program)
  - [] queueing compiles to avoid OOM
- [] View student code
- [] Cache builds for quick reruns (nix? bazel? manual hashing?)
- [] Backups (S3)
- [] Import/export of some sort

Milestone 6: Full classroom
- [] History to help detect cheating
- [] UI to show student status, easily look at code
- [] Hide tests or other files from students
- [] Hide implementation of specific methods from students
- [] Assignment (markdown) within the platform
- [] Ability to pull in libraries

Milestone 6b: Deployable
- [] "One button" deploy on Digital Ocean or other cheap cloud
- [] Web UI configuration for things like backups
- [] Documentation

Future:
- [] Cheating detection (MOSS, behavior like typing a lot with no backspaces)
- [] Integration with github for storing student code
- [] Running code client-side with CheerpJ/CheerpX/V86
- [] Persistent filesystem/container per student (maybe in a milestone?  Not sure if this is needed)
- [] Cost savings: spin down VM when not in use?
- [] Scaling: spin up more/bigger VM's for high demand (may be milestone 5/6?)
- [] Custom run/compile commands
