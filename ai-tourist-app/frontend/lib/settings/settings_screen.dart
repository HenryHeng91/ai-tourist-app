import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_models.dart';
import '../auth/auth_providers.dart';
import 'settings_providers.dart';

/// Settings screen — API key entry/validation/save, plus logout.
///
/// This is the primary surface for the BYOK vault (Issue #5 / task 2.2.2).
class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  static const String route = '/settings';

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _keyController = TextEditingController();
  bool _obscureKey = true;

  @override
  void initState() {
    super.initState();
    // Bootstrap vault state on first build.
    Future.microtask(
      () => ref.read(apiKeyVaultNotifierProvider.notifier).bootstrap(),
    );
  }

  @override
  void dispose() {
    _keyController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final key = _keyController.text.trim();
    if (key.isEmpty) return;
    await ref.read(apiKeyVaultNotifierProvider.notifier).saveKey(key);
    _keyController.clear();
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Remove API key?'),
            content: const Text(
              'The key will be deleted from this device and the encrypted '
              'backup will be removed from the server. This cannot be undone.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
              FilledButton.tonal(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Remove'),
              ),
            ],
          ),
        ) ??
        false;
    if (confirmed) {
      await ref.read(apiKeyVaultNotifierProvider.notifier).deleteKey();
    }
  }

  @override
  Widget build(BuildContext context) {
    final vault = ref.watch(apiKeyVaultNotifierProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _vaultCard(vault),
              const SizedBox(height: 24),
              _accountCard(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _vaultCard(ApiKeyVaultState vault) => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.vpn_key_outlined),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'AI Provider API Key',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  _statusChip(vault.validationStatus),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Your key is encrypted with AES-256-GCM on this device and '
                'never sent to our servers in plaintext. Inference calls go '
                'directly to your provider.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 20),
              if (vault.hasKey) _storedKeyRow(vault),
              if (!vault.hasKey) _newKeyField(),
              const SizedBox(height: 16),
              _actions(vault),
              if (vault.errorMessage != null) ...[
                const SizedBox(height: 12),
                Text(
                  vault.errorMessage!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontSize: 13,
                  ),
                ),
              ],
            ],
          ),
        ),
      );

  Widget _statusChip(ApiKeyValidationStatus status) {
    final (label, color) = switch (status) {
      ApiKeyValidationStatus.unknown => ('Unknown', Colors.grey),
      ApiKeyValidationStatus.validating => ('Validating…', Colors.orange),
      ApiKeyValidationStatus.valid => ('Valid', Colors.green),
      ApiKeyValidationStatus.invalid => ('Invalid', Colors.red),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _storedKeyRow(ApiKeyVaultState vault) => Row(
        children: [
          const Icon(Icons.check_circle, color: Colors.green, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'A key is stored for provider "${vault.provider ?? "openai"}".',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ),
        ],
      );

  Widget _newKeyField() => TextField(
        controller: _keyController,
        obscureText: _obscureKey,
        decoration: InputDecoration(
          labelText: 'Paste your API key',
          hintText: 'sk-…',
          prefixIcon: const Icon(Icons.key),
          suffixIcon: IconButton(
            icon: Icon(
              _obscureKey
                  ? Icons.visibility_outlined
                  : Icons.visibility_off_outlined,
            ),
            onPressed: () => setState(() => _obscureKey = !_obscureKey),
          ),
        ),
      );

  Widget _actions(ApiKeyVaultState vault) => Row(
        children: [
          if (!vault.hasKey)
            Expanded(
              child: FilledButton(
                onPressed: vault.validationStatus ==
                        ApiKeyValidationStatus.validating
                    ? null
                    : _save,
                child: const Text('Validate & save'),
              ),
            ),
          if (vault.hasKey) ...[
            Expanded(
              child: OutlinedButton(
                onPressed: vault.validationStatus ==
                        ApiKeyValidationStatus.validating
                    ? null
                    : () => ref
                        .read(apiKeyVaultNotifierProvider.notifier)
                        .revalidate(),
                child: const Text('Re-validate'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.tonal(
                onPressed: _delete,
                style: FilledButton.styleFrom(
                  foregroundColor: Theme.of(context).colorScheme.error,
                ),
                child: const Text('Remove'),
              ),
            ),
          ],
        ],
      );

  Widget _accountCard() => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Account',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Sign out'),
                onTap: () async {
                  await ref.read(authNotifierProvider.notifier).logout();
                  if (context.mounted) context.go('/login');
                },
              ),
            ],
          ),
        ),
      );
}