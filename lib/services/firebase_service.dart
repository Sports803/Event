import 'package:firebase_database/firebase_database.dart';
import '../models/sports_models.dart';

class FirebaseService {
  FirebaseService._();
  static final FirebaseService instance = FirebaseService._();

  static const databaseUrl = 'https://sports-803-1b806-default-rtdb.firebaseio.com';
  final FirebaseDatabase _database = FirebaseDatabase.instance;

  Future<List<SportsEvent>> fetchLiveEvents() async {
    final snapshot = await _database.ref('s803config/todaysMatches').get();
    final results = <SportsEvent>[];
    final value = snapshot.value;
    if (value is Map) {
      value.forEach((key, raw) {
        if (raw is Map) {
          final event = SportsEvent.fromMap(key.toString(), raw);
          if (event.isLive && event.channels.any((channel) => channel.src.isNotEmpty)) results.add(event);
        }
      });
    } else if (value is List) {
      for (var i = 0; i < value.length; i++) {
        final raw = value[i];
        if (raw is Map) {
          final event = SportsEvent.fromMap('$i', raw);
          if (event.isLive && event.channels.any((channel) => channel.src.isNotEmpty)) results.add(event);
        }
      }
    }
    results.sort((a, b) => (a.kickoff ?? DateTime.now()).compareTo(b.kickoff ?? DateTime.now()));
    return results;
  }

  Future<List<LiveChannel>> fetchChannels() async {
    final snapshot = await _database.ref('livetv/channels').get();
    final value = snapshot.value;
    final results = <LiveChannel>[];
    if (value is Map) {
      value.forEach((key, raw) {
        if (raw is Map) {
          final channel = LiveChannel.fromMap(key.toString(), raw);
          if (channel.src.isNotEmpty) results.add(channel);
        }
      });
    }
    return results;
  }
}
