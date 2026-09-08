// The client is not a deployable service on its own: it is a static bundle
// that the API process serves. If a platform is running this, its root
// directory or start command is pointing at client/ instead of the repo root.
console.error(`
  @driftle/client is not a standalone service.

  Driftle deploys as ONE service from the repository root:
    build:  npm run build     (builds the client, then the server)
    start:  npm start         (serves the API and the built client)

  Fix your deploy settings:
    - Root Directory:  the repository root, not "client"
    - Start Command:   npm start   (or leave empty to use the Dockerfile)
`);
process.exit(1);
