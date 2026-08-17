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
          if (event.isVisible && event.channels.any((channel) => channel.src.isNotEmpty)) results.add(event);
        }
      });
    } else if (value is List) {
      for (var i = 0; i < value.length; i++) {
        final raw = value[i];
        if (raw is Map) {
          final event = SportsEvent.fromMap('$i', raw);
          if (event.isVisible && event.channels.any((channel) => channel.src.isNotEmpty)) results.add(event);
        }
      }
    }
    final unique = <String, SportsEvent>{};
    for (final event in results) {
      final key = _eventIdentity(event);
      final previous = unique[key];
      if (previous == null || event.channels.length > previous.channels.length || (event.isLive && !previous.isLive)) unique[key] = event;
    }
    final deduped = unique.values.toList();
    deduped.sort((a, b) {
      if (a.isLive != b.isLive) return a.isLive ? -1 : 1;
      return (a.kickoff ?? DateTime.now()).compareTo(b.kickoff ?? DateTime.now());
    });
    return deduped;
  }

  String _eventIdentity(SportsEvent event) {
    final kickoff = event.kickoff?.millisecondsSinceEpoch;
    return '${event.homeName.toLowerCase().trim()}|${event.awayName.toLowerCase().trim()}|${kickoff == null ? 'unknown' : (kickoff ~/ 60000)}';
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
