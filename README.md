# Helm Charts Repository

Add this repository to Helm:

```bash
helm repo add manulix3d https://charts.manulix3d.de
helm repo update
```

## Available Charts

| Chart                    | Chart Version | App Version | Description                                                                           |
| :----------------------- | :------------ | :---------- | ------------------------------------------------------------------------------------- |
| manulix3d/authelia       | 0.11.6        | 4.39.20     | Authelia is a Single Sign-On Multi-Factor portal for web apps                         |
| manulix3d/authentik      | 2026.5.0      | 2026.5.0    | authentik is an open-source Identity Provider focused on flexibility and versatility  |
| manulix3d/cloudnative-pg | 0.28.2        | 1.29.1      | CloudNativePG Operator Helm Chart                                                     |
| manulix3d/homebox        | 0.4.7         | v0.25.0     | A Helm chart for HomeBox, the inventory and organization system built for the Home Us |
| manulix3d/pocket-id      | 2.0.9         | v2.7.0      | pocket-id is a simple and easy-to-use OIDC provider that allows users to authenticate |
| manulix3d/vaultwarden    | 0.36.7        | 1.36.0      | vaultwarden is an unofficial Bitwarden-compatible server written in Rust              |

## Search Charts
```bash
helm search repo manulix3d
```