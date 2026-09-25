# Games

This repository holds **Arcade**, a set of browser games for your local network that runs in your k3s cluster. Play against the computer, pass one device around, or invite anyone on your Wi-Fi to a table with a link, a QR code or a four-letter code.

It also still contains the original C++ `BattleShip/` prototype, which is untouched.

![Arcade home page](docs/screenshots/home.webp)

| Game | Players | vs computer | Highlights |
| --- | --- | --- | --- |
| **Yahtzee** | 1–6 | Easy / Medium / Hard | Official scoring with Yahtzee bonuses and Joker rules, solo high scores. Hard averages about 245 points. |
| **Chess** | 2 | Easy / Medium / Hard | Full rules, draw offers, optional clocks (3+2 up to 30 min), PGN export. Engine uses alpha-beta search with a small opening book. |
| **Checkers** | 2 | Easy / Medium / Hard | American rules: forced captures (can be turned off), multi-jumps, kings, 40-move draw rule. |
| **Connect 4** | 2 | Easy / Medium / Hard | Falling discs; the hard computer searches deep and is tough to beat. |
| **Battleship** | 2 | Easy / Medium / Hard | Tap to place ships (or randomize), three firing modes (classic, streak, salvo), probability-map AI, pass-the-device screens. |
| **Tic-Tac-Toe** | 2 | Easy / Medium / Hard | Hard never loses. |
| **Pinball** | 1–8 | n/a | Physics table with flippers, bumpers, slingshots, drop targets, multiball, kickback, tilt. Solo, pass-and-play, or an online score attack where everyone plays at once. |

Every table has chat, spectators and rematches (players swap sides each rematch). High scores (Yahtzee, pinball) and win/loss records between people are kept in a hall of fame.

<p>
  <img alt="Chess against the computer" src="docs/screenshots/chess.webp" width="49%">
  <img alt="Pinball" src="docs/screenshots/pinball.webp" width="49%">
</p>

## Deploy to k3s

### 1. Get the image

The GitHub Actions workflow (`.github/workflows/arcade.yml`) runs the tests and publishes
`ghcr.io/joelmiller1/games` for `linux/amd64` and `linux/arm64` on every push to `master`
(tags `latest` and `sha-<commit>`, plus `x.y.z` for `vx.y.z` git tags).

New GitHub packages start out private. Either make it public (GitHub → your profile → **Packages** → **games** →
**Package settings** → **Change visibility**), or give the cluster a pull secret:

```sh
kubectl create namespace games
kubectl -n games create secret docker-registry ghcr \
  --docker-server=ghcr.io --docker-username=joelmiller1 --docker-password=<token with read:packages>
kubectl -n games patch serviceaccount default -p '{"imagePullSecrets":[{"name":"ghcr"}]}'
```

**No registry?** Build on a machine with Docker and import the image straight into k3s:

```sh
docker build -t arcade:local arcade/
docker save arcade:local | sudo k3s ctr images import -     # run on each node (or copy the tar over)
```

Then point `deploy/k8s/kustomization.yaml` at it (`newName: docker.io/library/arcade`, `newTag: local`)
and set `imagePullPolicy: IfNotPresent` in `deploy/k8s/deployment.yaml`.

The image supports 64-bit x86 and ARM (for example a Raspberry Pi 4/5 on a 64-bit OS). Node.js 24 does not ship 32-bit ARM images.

### 2. Apply the manifests

```sh
kubectl apply -k deploy/k8s        # or: sudo k3s kubectl apply -k deploy/k8s
kubectl -n games get pods,svc
```

This creates the `games` namespace, a 256 Mi volume for scores (`local-path`, the k3s default), a single-replica
Deployment with a locked-down security context, a `LoadBalancer` Service and an Ingress.

### 3. Play

* **http://&lt;any-node-ip&gt;:8080**. k3s's built-in ServiceLB exposes the Service on every node, so this works
  from phones and laptops with no DNS setup. With MetalLB you get a dedicated IP instead (`kubectl -n games get svc arcade`).
* **http://games.lan** through Traefik, once `games.lan` resolves to a node (add a record in your router or
  Pi-hole, or edit the host in `deploy/k8s/ingress.yaml`).

Pick a game, choose **Online** and share the link or QR code shown at the table. Anyone on the network can also
open the home page and join from **Open tables**.

### Updating

Push to `master`, wait for the workflow, then:

```sh
kubectl -n games rollout restart deployment/arcade
```

Tables in progress end when the pod restarts (they live in memory); high scores and records are on the volume and survive.

## Configuration

Environment variables (set them in `deploy/k8s/deployment.yaml`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `BASE_PATH` | `/` | Serve under a sub-path, e.g. `/games/` behind a shared ingress host |
| `DATA_DIR` | `./data` (`/data` in the image) | Where `arcade-data.json` (high scores, records) is written |
| `BOT_THREADS` | CPU count − 1, max 2 | Worker threads for computer players |
| `ROOM_IDLE_MINUTES` | `30` | Close tables nobody has looked at for this long |
| `MAX_ROOMS` | `300` | Upper limit on open tables |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` |

Health probes answer at `/healthz` and `/readyz` regardless of `BASE_PATH`.

## Development

Requires Node.js 20.10 or newer. There is no build step: the browser loads the ES modules directly.

```sh
cd arcade
npm install
npm start          # http://localhost:8080  (npm run dev restarts on server changes)
npm test           # rules engines, computer players, pinball physics, server integration
npm run check      # syntax-checks every file, including browser-only modules
```

### How it fits together

```
arcade/
  server/          HTTP + WebSocket server (ws), rooms, lobby, worker-thread pool for computer players, JSON store
  shared/games/    one rules engine per game: pure functions over JSON state (setup/act/view/outcome/bot)
  shared/chess/    move generator (perft-verified) and alpha-beta search
  public/          single-page app: lobby, setup and room views, one board module per game
  public/js/pinball/  pinball physics, table, rules and canvas renderer (runs in the browser)
deploy/k8s/        kustomize manifests for k3s
```

The server is authoritative: clients send actions, the engine validates them, and every seat gets its own
view of the state (so Battleship fleets never reach the other player's browser). Computer players are just seats
whose moves come from the engine's `bot()` function, run in worker threads so a chess search never stalls
other tables. Pinball is the exception: it runs locally in each browser and only reports scores.

To add a game: add its metadata to `shared/games/meta.js`, write an engine in `shared/games/` and register it in
`shared/games/index.js`, then add a board module in `public/js/games/` and list it in `public/js/views/room.js`.

## Notes

* There are no accounts: each browser gets a random identity and a name you can change from the top bar.
  Refreshing or a phone going to sleep puts you back in your seat.
* The app is plain HTTP for the local network. Everything is served by the arcade itself (no CDNs), so it also
  works on a network without internet access.
