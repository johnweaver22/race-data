# GitHub Pages deployment

This is the Race Data app, separate from Swim Clock. The intended repository
is `johnweaver22/race-data`. Do not upload it to `swim-timer`.

Run `npm test` and `npm run build:pages` before committing changes. The generated
`docs/` files are committed so GitHub Pages can serve the app without a build
service, Worker, template request or ChatGPT login gate.

In repository Settings > Pages, select Deploy from a branch, then branch `main`
and folder `/docs`. Save and wait for the Pages deployment to complete.

All app URLs are relative, including the logo and module imports, so the app
works under the repository URL path. `.nojekyll` disables Jekyll processing.
Only browser app files and the unchanged RL logo are published.

CSV is generated on the device. Race data is held in the open tab and is never
uploaded by the app. Test a full capture and CSV save on phone and iPad after
deployment. A successful preview download alone does not verify those devices.
