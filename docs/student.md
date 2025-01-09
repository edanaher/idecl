# Student experience in idecl

idecl is a new, very experimental IDE for working on projects in a classroom environment.  It is nowhere near finished, and there are plenty of rough edges, missing features, and likely a couple bugs.  But hopefully it's far enough along to provide a useful environment to learn Java.

## Getting started

To log in, visit the page provided by your teacher and click the "Login with Google" text in the upper left corner.  You should be able to log in with your school account.  If not, contact your teacher.

When you log in, if you're only in one class (which you probably are), you'll see a list of projects.  Some may have black text with a "Clone project as assignment button" next to it; clicking this button should remove that project and give you a new blue hyperlinked project with your e-mail address in the title.  Clicking that project will bring you to the development environment, which is where you'll spend most of your time.

(If you're in multiple classes, the first screen will let you pick which class.  Pick one, and you'll see a a list of projects for that class.)

## Development environment

### File list on the left side

The navigation bar on the left has a list of files; click on one to open it in the code editor on the left panel.  The green-highlighted file is the current open file.  Files with gray backgrounds are read-only; you can view them, but will be unable to edit them.  Clicking on the currently open file will allow you to rename it; you should not need to rename files for most assignments.

The plus and minus buttons below the list of files allow you to add and delete files; you should not need to use those for most projects.

#### Saving and loading

The save and load buttons allow you to save and load from the server.  All changes are automatically saved on your computer, and saved to the server within a short time.  If the save button is yellow, your changes have not yet been saved to the server and will not be visible to your teacher; you can click it or wait a few seconds for it to turn green.  Additionally, if you try to leave the page without saving to the server, you will get a warning about unsaved work.  If you ignore this warning, you will not lose work, but it won't be visible to your teacher until you save.

#### History

Below save and load are two arrow buttons and a pair of numbers.  These let you go back in your history to see files as they previously existed.  However, this file is incomplete and buggy; it should not lose data, but may not give you a true history of your file.  Hopefully this will be fixed in the next couple weeks.

### Running your code

The two buttons above the code editor allow you to "run" your main method and "run tests" provided by your teacher.  When you press either of these buttons, the "Program output" panel on the righ will show the results of your run, whether that's a compile error, output from your program, or the result of tests.

The "clear" button will clear the output in the right panel; you may wish to use this after a long series of output so it's easier to see what happens in the next run.

To the right of the "clear" button may be gray text indicating the state of your run.  Common values include "starting" indicating that the process is beginning, "compiling", "error compiling", "running", or "complete".  It also may indicate that you're in the queue to compile; due to limited resources, only a couple programs can compile simultaneously.  The position in the queue should be approximately accurate, and once it reaches zero your program should compile and run.

If your program reads from the keyboard, you can click on the right panel and the cursor should change from a line to a rectangle.  At this point, you should be able to type in your input and press enter, and your program should read the input and continue.

### Instructions

There is likely an instructions.md file in your project.  This is a special file that describes the project.  You can view it either by selecting it from the file list on the left, or by clicking the "Show instructions" button in the upper right.  After clicking "Show instructions", you can click the button (now labelled "Show output") to show your program's output again.

### Comments

In the lower-left of the development environment is a "Comments" button.  This button brings up an input box for you to put in suggestions; these will be saved (along with your user id) and used to help fix bugs or prioritize features.  If you see something broken, please put it in there.  If there's a feature you want, please put it in there.  If you're just so excited about how great this project is, please put it in there.

### Layouts

By default, the left and right panels each take up half the screen.  However, you can maximize either panel by clicking the "switch layout" in the top-middle of the screen; it will rotate between the split-view, full-screen left panel, and full-screen right panel.  This can be useful if you have long lines of code or long error messages in the terminal.

### Submitting projects

When you're done with your project, use the "submit project" button in the upper-middle of the screen.  This signals to your teacher that you're done with the project and ready for it to be graded.

## End note

Hopefully these instructions help get you oriented, but this should generally be pretty straightforward.
