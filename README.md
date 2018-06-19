# MWS Restaurant Stage 3
## How to run project
First change working directory to folder, where you want to clone the project.
```bash
git clone https://github.com/Zydnar/mws-restaurant-stage-3.git
```
Change directory to project folder and Install node dependencies:
```bash
yarn
```
or
```bash
npm i
```
Run the server
```bash
npm start
```
or
```bash
node app.js
```
By default server will be available at:  [http://localhost:1337](http://localhost:1337)

### Notes to reviewer

Strategy I've choosen for syncing requests sent when offline (window.ononline event) requires to shut down both Sails.js server and internet connection. After eg. toggling restaurant as favorite, first launch Sails.js then establish connection with internet, otherwise request would be sent to not launched developement server.