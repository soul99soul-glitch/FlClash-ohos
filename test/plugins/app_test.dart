import 'package:fl_clash/plugins/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final app = App();

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(app.methodChannel, null);
  });

  test('a platform without application icons returns no image', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(app.methodChannel, (_) async => '');
    expect(await app.getPackageIcon('example.app'), isNull);
  });

  test('an available application icon retains its file path', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          app.methodChannel,
          (_) async => '/tmp/icon.png',
        );
    final image = await app.getPackageIcon('example.app') as FileImage;
    expect(image.file.path, '/tmp/icon.png');
  });
}
