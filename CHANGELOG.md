# Changelog

## 1.2.0

- Fix offchain UID calculation to match eas-sdk v1 (schema packed as UTF-8 `bytes`)
- Restore UID check in `verifyOffchainAttestationSignature`

## 1.1.0

- Move receipt UID/timestamp helpers onto EAS and filter logs by EAS address
- Have EIP712Proxy.getEAS return an EAS instance
- Add EIP712Proxy.getEASAddress for the EAS contract address
- Have Indexer.getEAS return an EAS instance and add Indexer.getEASAddress
- Fix publicClient.call adapter to return hex data
