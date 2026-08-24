# Controlled live test

Live mode is not enabled by repository creation. Before any live activation:

1. Configure provider credentials in a secret manager.
2. Verify read-only connectivity and balances.
3. Run the complete scanner in `DRY_RUN`.
4. Confirm order-book/VWAP, fee, gas, slippage and reserve calculations.
5. Start with one highly liquid market and one network.
6. Use the smallest supported trade size; a $3-equivalent account is a configuration target, not a promise that venues permit that size.
7. Verify both legs and reconciliation before enabling capital rotation.
8. Test emergency stop and recovery.

If a provider is missing credentials, its state must be `NOT_CONFIGURED`, never simulated as connected.
