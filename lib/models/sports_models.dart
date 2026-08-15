class SportsEvent {
  const SportsEvent({
    required this.id,
    required this.kickoff,
    required this.duration,
    required this.homeName,
    required this.awayName,
    required this.homeLogo,
    required this.awayLogo,
    required this.leagueName,
    required this.statusType,
    required this.channels,
    required this.category,
    this.homeScore,
    this.awayScore,
  });

  final String id;
  final DateTime? kickoff;
  final int duration;
  final String homeName;
  final String awayName;
  final String homeLogo;
  final String awayLogo;
  final String leagueName;
  final String statusType;
  final List<StreamSource> channels;
  final String category;
  final int? homeScore;
  final int? awayScore;

  bool get isLive {
    final normalized = statusType.toUpperCase();
    const ended = {'FINAL', 'FULL_TIME', 'STATUS_FINAL', 'STATUS_FINISHED', 'ENDED', 'CANCELLED'};
    if (ended.contains(normalized)) return false;
    const explicitLive = {'STATUS_IN_PROGRESS', 'STATUS_HALFTIME', 'STATUS_OVERTIME', 'STATUS_SHOOTOUT', 'LIVE', 'IN_PROGRESS'};
    if (explicitLive.contains(normalized)) return true;
    if (kickoff == null) return false;
    final end = kickoff!.add(Duration(minutes: duration));
    final now = DateTime.now().toUtc();
    return now.isAfter(kickoff!) && now.isBefore(end);
  }

  factory SportsEvent.fromMap(String id, Map<dynamic, dynamic> raw) {
    final channelsRaw = raw['channels'];
    final parsedChannels = <StreamSource>[];
    if (channelsRaw is List) {
      for (var i = 0; i < channelsRaw.length; i++) {
        final item = channelsRaw[i];
        if (item is Map) parsedChannels.add(StreamSource.fromMap(item, fallbackLabel: 'Stream ${i + 1}'));
      }
    } else if (channelsRaw is Map) {
      channelsRaw.forEach((key, value) {
        if (value is Map) parsedChannels.add(StreamSource.fromMap(value, fallbackLabel: key.toString()));
      });
    }
    final kickoffText = raw['kickoff']?.toString();
    return SportsEvent(
      id: id,
      kickoff: kickoffText == null ? null : DateTime.tryParse(kickoffText)?.toUtc(),
      duration: int.tryParse('${raw['duration'] ?? 120}') ?? 120,
      homeName: '${raw['homeName'] ?? raw['homeTeam'] ?? 'Home'}',
      awayName: '${raw['awayName'] ?? raw['awayTeam'] ?? 'Away'}',
      homeLogo: '${raw['homeLogo'] ?? ''}',
      awayLogo: '${raw['awayLogo'] ?? ''}',
      leagueName: '${raw['leagueName'] ?? raw['league'] ?? 'Live Event'}',
      statusType: '${raw['statusType'] ?? raw['status'] ?? ''}',
      channels: parsedChannels,
      category: '${raw['category'] ?? raw['sport'] ?? 'Other'}'.toLowerCase(),
      homeScore: _score(raw['homeScore'] ?? raw['homeGoals']),
      awayScore: _score(raw['awayScore'] ?? raw['awayGoals']),
    );
  }

  static int? _score(dynamic value) => value == null ? null : int.tryParse(value.toString());
}

class StreamSource {
  const StreamSource({required this.label, required this.src});
  final String label;
  final String src;

  factory StreamSource.fromMap(Map<dynamic, dynamic> raw, {String fallbackLabel = 'Stream'}) {
    return StreamSource(label: '${raw['label'] ?? raw['name'] ?? fallbackLabel}', src: '${raw['src'] ?? raw['url'] ?? ''}');
  }
}

class LiveChannel {
  const LiveChannel({required this.key, required this.name, required this.src});
  final String key;
  final String name;
  final String src;

  factory LiveChannel.fromMap(String key, Map<dynamic, dynamic> raw) {
    return LiveChannel(key: key, name: '${raw['name'] ?? key}', src: '${raw['src'] ?? raw['url'] ?? ''}');
  }
}
