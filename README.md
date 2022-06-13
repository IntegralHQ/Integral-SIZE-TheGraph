# Integral Subgraph
The Integral subgraph (SG) aims to provide a similar dataset and schema as the Uniswap subgraph.

## How to build
```shell
yarn
yarn codegen
yarn build
```

## How to deploy
### Before deploying for the first time
Build the project (see above). Then, log in to The Graph with your GitHub account and go to your hosted service dashboard here:

https://thegraph.com/hosted-service/dashboard

Your access token will be shown on the page. Store it on your machine (you'll only have to do it once):
```shell
graph auth --product hosted-service <ACCESS_TOKEN>
```
If the subgraph hasn't been created, you can create it from your dashboard.

Make sure that the "deploy" command in `package.json` has the correct SG name:

```json
"deploy": "graph deploy --node https://api.thegraph.com/deploy/ <GITHUB_USERNAME>/<SUBGRAPH_NAME>"
```
For example:
```json
"deploy": "graph deploy --node https://api.thegraph.com/deploy/ IntegralHQ/integral-size"
```

### Deploy
```shell
yarn deploy
```
