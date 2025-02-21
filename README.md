# Wrapped Keys Code Examples

This code demonstrates how to use the Wrapped Keys SDK.

## Running the Examples

### Install the Dependencies

In this directory, `wrapped-keys/nodejs`, run `yarn` to install the project dependencies.

### Setting Up the `.env` File

Make a copy of the provided `.env.example` file and name it `.env`:

```
cp .env.example .env
```

Within the `.env` there are the ENVs:

1. `ETHEREUM_PRIVATE_KEY` - **Required**
   - Must have Lit test tokens on the Chronicle Yellowstone blockchain
     - [Faucet for Chronicle Yellowstone](https://chronicle-yellowstone-faucet.getlit.dev/)
   - Will be used to mint PKPs and pay for Lit usage

### Running the Tests

After the `.env` is configured, there are several NPM scripts in the `package.json` to run individual test suites, or to run all the tests:

- `test:solana ` Runs all the test
