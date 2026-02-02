# Helm Charts Repository

Add this repository to Helm:

```bash
helm repo add manulix3d https://charts.manulix3d.de
helm repo update
```

## Available Charts

| Chart                    | Chart Version | App Version | Description                                                                           |
| :----------------------- | :------------ | :---------- | ------------------------------------------------------------------------------------- |
| manulix3d/authelia       | 0.10.49       | 4.39.13     | Authelia is a Single Sign-On Multi-Factor portal for web apps                         |
| manulix3d/authentik      | 2025.12.2     | 2025.12.2   | authentik is an open-source Identity Provider focused on flexibility and versatility  |
| manulix3d/cloudnative-pg | 0.27.0        | 1.28.0      | CloudNativePG Operator Helm Chart                                                     |
| manulix3d/homebox        | 0.4.3         | v0.23.1     | A Helm chart for HomeBox, the inventory and organization system built for the Home Us |
| manulix3d/pocket-id      | 2.0.2         | v2.2.0      | pocket-id is a simple and easy-to-use OIDC provider that allows users to authenticate |
| manulix3d/vaultwarden    | 0.36.0        | 1.35.2      | vaultwarden is an unofficial Bitwarden-compatible server written in Rust              |

## Search Charts
```bash
helm search repo manulix3d
```