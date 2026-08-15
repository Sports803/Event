import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'models/sports_models.dart';
import 'services/firebase_service.dart';

const bg = Color(0xFF080C18);
const surface = Color(0xFF111827);
const surface2 = Color(0xFF172033);
const accent = Color(0xFFE0102A);
const muted = Color(0xFF9AA4B5);
const logoUrl = 'https://blogger.googleusercontent.com/img/a/AVvXsEjNcYMOzvEw_evWplzi1ZDCn83pl2z3KJ0-LOPZgQAbiuAFV3k3wb4M-fxJBl-cZR4dM_mBH2B4IIbhETk9whmnJ3dvAPOurg-oRjf4tavZiU0QDv-ZvviEmFfnAtTFxIxhdHAS7tj3AEfttDW1HWp_bNgmURb9W3MjyH2CFs-ygcdm3-zpeGAUT5OCW_wl=s254';

const bannerHome = 'ca-app-pub-5622139873916803/8898112504';
const bannerPlayer = 'ca-app-pub-5622139873916803/2770215671';
const bannerLiveTv = 'ca-app-pub-5622139873916803/8006918844';
const interstitialUnit = 'ca-app-pub-5622139873916803/7775130344';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  await MobileAds.instance.initialize();
  runApp(const Sports803App());
}

class Sports803App extends StatelessWidget {
  const Sports803App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Sports 803',
        theme: ThemeData(
          brightness: Brightness.dark,
          scaffoldBackgroundColor: bg,
          colorScheme: ColorScheme.fromSeed(seedColor: accent, brightness: Brightness.dark),
          textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
          appBarTheme: const AppBarTheme(backgroundColor: bg, elevation: 0),
        ),
        home: const Shell(),
      );
}

class Shell extends StatefulWidget {
  const Shell({super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> {
  int tab = 0;
  final favorites = <String>{};
  List<SportsEvent> events = [];
  bool loading = true;
  String category = 'all';

  @override
  void initState() {
    super.initState();
    _loadFavorites();
    refresh();
  }

  Future<void> _loadFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() => favorites.addAll(prefs.getStringList('favorites') ?? []));
  }

  Future<void> toggleFavorite(String id) async {
    setState(() => favorites.contains(id) ? favorites.remove(id) : favorites.add(id));
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList('favorites', favorites.toList());
  }

  Future<void> refresh() async {
    setState(() => loading = true);
    try {
      final fresh = await FirebaseService.instance.fetchLiveEvents();
      if (mounted) setState(() => events = fresh);
    } catch (_) {
      if (mounted) setState(() => events = []);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomePage(events: events, loading: loading, category: category, favorites: favorites, onRefresh: refresh, onCategory: (v) => setState(() => category = v), onFavorite: toggleFavorite),
      const LiveTvPage(),
      FavoritesPage(events: events.where((e) => favorites.contains(e.id)).toList(), favorites: favorites, onFavorite: toggleFavorite),
      const MorePage(),
    ];
    return Scaffold(
      body: IndexedStack(index: tab, children: pages),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF0D1321),
        indicatorColor: accent.withOpacity(.18),
        selectedIndex: tab,
        onDestinationSelected: (value) => setState(() => tab = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.sports_soccer_outlined), selectedIcon: Icon(Icons.sports_soccer, color: accent), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.live_tv_outlined), selectedIcon: Icon(Icons.live_tv, color: accent), label: 'Live TV'),
          NavigationDestination(icon: Icon(Icons.star_border), selectedIcon: Icon(Icons.star, color: accent), label: 'Favorites'),
          NavigationDestination(icon: Icon(Icons.more_horiz), selectedIcon: Icon(Icons.more_horiz, color: accent), label: 'More'),
        ],
      ),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({super.key, required this.events, required this.loading, required this.category, required this.favorites, required this.onRefresh, required this.onCategory, required this.onFavorite});
  final List<SportsEvent> events;
  final bool loading;
  final String category;
  final Set<String> favorites;
  final Future<void> Function() onRefresh;
  final ValueChanged<String> onCategory;
  final ValueChanged<String> onFavorite;

  @override
  Widget build(BuildContext context) {
    final categories = ['all', ...{for (final e in events) e.category}];
    final filtered = category == 'all' ? events : events.where((e) => e.category == category).toList();
    return SafeArea(
      child: RefreshIndicator(
        color: accent,
        backgroundColor: surface,
        onRefresh: onRefresh,
        child: CustomScrollView(slivers: [
          SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(20, 18, 20, 8), child: Row(children: [
            ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.network(logoUrl, height: 42, width: 42, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Icon(Icons.sports, color: accent, size: 38))),
            const SizedBox(width: 12),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('SPORTS 803', style: GoogleFonts.poppins(fontSize: 21, fontWeight: FontWeight.w800, letterSpacing: 1.2)), const Text('LIVE SPORTS HUB', style: TextStyle(color: muted, fontSize: 10, letterSpacing: 2.1))]),
            const Spacer(),
            Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(13)), child: const Icon(Icons.notifications_none, color: Colors.white70)),
          ]))),
          SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(20, 22, 20, 15), child: Row(children: [Text('Live now', style: GoogleFonts.poppins(fontSize: 27, fontWeight: FontWeight.w700)), const SizedBox(width: 10), Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5), decoration: BoxDecoration(color: accent.withOpacity(.15), borderRadius: BorderRadius.circular(20)), child: Text('${filtered.length}', style: const TextStyle(color: accent, fontWeight: FontWeight.bold)))]))),
          SliverToBoxAdapter(child: SizedBox(height: 42, child: ListView.separated(padding: const EdgeInsets.symmetric(horizontal: 20), scrollDirection: Axis.horizontal, itemCount: categories.length, separatorBuilder: (_, __) => const SizedBox(width: 9), itemBuilder: (_, i) { final item = categories[i]; return ChoiceChip(label: Text(item == 'all' ? 'All' : _title(item)), selected: item == category, onSelected: (_) => onCategory(item), selectedColor: accent, backgroundColor: surface, labelStyle: TextStyle(color: item == category ? Colors.white : muted, fontWeight: FontWeight.w600)); }))),
          if (loading) const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: accent))))
          else if (filtered.isEmpty) const SliverToBoxAdapter(child: EmptyState())
          else SliverList(delegate: SliverChildBuilderDelegate((context, index) => EventCard(event: filtered[index], favorite: favorites.contains(filtered[index].id), onFavorite: () => onFavorite(filtered[index].id)), childCount: filtered.length)),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
          const SliverToBoxAdapter(child: AdBanner(unitId: bannerHome)),
          const SliverToBoxAdapter(child: SizedBox(height: 12)),
        ]),
      ),
    );
  }

  static String _title(String input) => input.isEmpty ? input : '${input[0].toUpperCase()}${input.substring(1)}';
}

class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event, required this.favorite, required this.onFavorite});
  final SportsEvent event;
  final bool favorite;
  final VoidCallback onFavorite;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(20, 8, 20, 8),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(22), border: Border.all(color: Colors.white.withOpacity(.05))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [Container(padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5), decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(7)), child: const Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.circle, size: 7), SizedBox(width: 5), Text('LIVE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: .8))])), const SizedBox(width: 8), Expanded(child: Text(event.leagueName, style: const TextStyle(color: muted, fontSize: 12, fontWeight: FontWeight.w600))), IconButton(onPressed: onFavorite, icon: Icon(favorite ? Icons.star : Icons.star_border, color: favorite ? Colors.amber : muted))]),
          const SizedBox(height: 15),
          Row(children: [Expanded(child: Team(name: event.homeName, logo: event.homeLogo)), Column(children: [Text('${event.homeScore ?? '-'} : ${event.awayScore ?? '-'}', style: GoogleFonts.poppins(fontSize: 24, fontWeight: FontWeight.w800)), const Text('IN PLAY', style: TextStyle(color: accent, fontSize: 9, letterSpacing: 1.2, fontWeight: FontWeight.bold))]), Expanded(child: Team(name: event.awayName, logo: event.awayLogo, right: true))]),
          const SizedBox(height: 16),
          if (event.channels.isNotEmpty) SizedBox(height: 38, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: event.channels.length, separatorBuilder: (_, __) => const SizedBox(width: 8), itemBuilder: (_, i) => OutlinedButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PlayerScreen(event: event, selected: i))), icon: const Icon(Icons.play_arrow, size: 16), label: Text(event.channels[i].label), style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: BorderSide(color: accent.withOpacity(.7)), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))))))
        ]),
      );
}

class Team extends StatelessWidget {
  const Team({super.key, required this.name, required this.logo, this.right = false});
  final String name, logo;
  final bool right;
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: right ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [CircleAvatar(radius: 23, backgroundColor: surface2, backgroundImage: logo.isEmpty ? null : NetworkImage(logo), child: logo.isEmpty ? const Icon(Icons.shield_outlined, color: muted) : null), const SizedBox(height: 7), Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: right ? TextAlign.right : TextAlign.left, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))]);
}

class PlayerScreen extends StatefulWidget {
  const PlayerScreen({super.key, required this.event, required this.selected});
  final SportsEvent event;
  final int selected;
  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> {
  late int selected;
  late final WebViewController controller;
  InterstitialAd? interstitial;
  @override
  void initState() {
    super.initState();
    selected = widget.selected;
    controller = WebViewController()..setJavaScriptMode(JavaScriptMode.unrestricted)..setBackgroundColor(Colors.black)..loadRequest(Uri.parse(widget.event.channels[selected].src));
    InterstitialAd.load(adUnitId: interstitialUnit, request: const AdRequest(), adLoadCallback: InterstitialAdLoadCallback(onAdLoaded: (ad) => interstitial = ad, onAdFailedToLoad: (_) {}));
  }
  @override
  void dispose() { interstitial?.dispose(); super.dispose(); }
  void switchStream(int index) { setState(() => selected = index); controller.loadRequest(Uri.parse(widget.event.channels[index].src)); }
  @override
  Widget build(BuildContext context) => WillPopScope(onWillPop: () async { if (interstitial != null) { interstitial!.show(); interstitial = null; } return true; }, child: Scaffold(appBar: AppBar(title: const Text('Live Player', style: TextStyle(fontWeight: FontWeight.w700)), actions: [IconButton(onPressed: () {}, icon: const Icon(Icons.fullscreen))]), body: Column(children: [Expanded(flex: 6, child: WebViewWidget(controller: controller)), Expanded(flex: 4, child: SingleChildScrollView(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [const Icon(Icons.circle, color: accent, size: 10), const SizedBox(width: 7), const Text('LIVE NOW', style: TextStyle(color: accent, fontWeight: FontWeight.bold, letterSpacing: 1.1))]), const SizedBox(height: 10), Text('${widget.event.homeName} vs ${widget.event.awayName}', style: GoogleFonts.poppins(fontSize: 21, fontWeight: FontWeight.w700)), Text(widget.event.leagueName, style: const TextStyle(color: muted)), const SizedBox(height: 16), Text('${widget.event.homeScore ?? '-'}  :  ${widget.event.awayScore ?? '-'}', style: GoogleFonts.poppins(fontSize: 31, fontWeight: FontWeight.w800)), const SizedBox(height: 16), SizedBox(height: 40, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: widget.event.channels.length, separatorBuilder: (_, __) => const SizedBox(width: 8), itemBuilder: (_, i) => ChoiceChip(label: Text(widget.event.channels[i].label), selected: i == selected, selectedColor: accent, onSelected: (_) => switchStream(i)))), const SizedBox(height: 10), const AdBanner(unitId: bannerPlayer)])))]));
}

class LiveTvPage extends StatefulWidget { const LiveTvPage({super.key}); @override State<LiveTvPage> createState() => _LiveTvPageState(); }
class _LiveTvPageState extends State<LiveTvPage> {
  late Future<List<LiveChannel>> future;
  @override void initState() { super.initState(); future = FirebaseService.instance.fetchChannels(); }
  @override Widget build(BuildContext context) => SafeArea(child: CustomScrollView(slivers: [SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(20, 22, 20, 18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('Live TV', style: GoogleFonts.poppins(fontSize: 28, fontWeight: FontWeight.w700)), const SizedBox(height: 4), const Text('Your favourite channels, streaming live', style: TextStyle(color: muted))])), FutureBuilder<List<LiveChannel>>(future: future, builder: (context, snap) { if (!snap.hasData) return const SliverToBoxAdapter(child: Center(child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator(color: accent)))); if (snap.data!.isEmpty) return const SliverToBoxAdapter(child: EmptyState(label: 'No live channels available')); return SliverList(delegate: SliverChildBuilderDelegate((context, index) { final channel = snap.data![index]; return ListTile(contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 5), leading: Container(width: 52, height: 52, decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(15)), child: const Icon(Icons.tv, color: accent)), title: Text(channel.name, style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: const Text('Watch inside the app', style: TextStyle(color: muted, fontSize: 12)), trailing: const Icon(Icons.play_circle_fill, color: accent, size: 30), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ChannelPlayer(channel: channel)))); }, childCount: snap.data!.length)); }), const SliverToBoxAdapter(child: AdBanner(unitId: bannerLiveTv))]));
}

class ChannelPlayer extends StatelessWidget { const ChannelPlayer({super.key, required this.channel}); final LiveChannel channel; @override Widget build(BuildContext context) { final controller = WebViewController()..setJavaScriptMode(JavaScriptMode.unrestricted)..loadRequest(Uri.parse(channel.src)); return Scaffold(appBar: AppBar(title: Text(channel.name)), body: Column(children: [Expanded(child: WebViewWidget(controller: controller)), const AdBanner(unitId: bannerLiveTv)])); } }

class FavoritesPage extends StatelessWidget { const FavoritesPage({super.key, required this.events, required this.favorites, required this.onFavorite}); final List<SportsEvent> events; final Set<String> favorites; final ValueChanged<String> onFavorite; @override Widget build(BuildContext context) => SafeArea(child: CustomScrollView(slivers: [SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.fromLTRB(20, 22, 20, 16), child: Text('Favorites', style: GoogleFonts.poppins(fontSize: 28, fontWeight: FontWeight.w700)))), if (events.isEmpty) const SliverToBoxAdapter(child: EmptyState(label: 'Star a live event to see it here')) else SliverList(delegate: SliverChildBuilderDelegate((context, i) { final event = events[i]; return EventCard(event: event, favorite: favorites.contains(event.id), onFavorite: () => onFavorite(event.id)); }, childCount: events.length))])); }

class MorePage extends StatelessWidget { const MorePage({super.key}); @override Widget build(BuildContext context) => SafeArea(child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const SizedBox(height: 20), Text('More', style: GoogleFonts.poppins(fontSize: 28, fontWeight: FontWeight.w700)), const SizedBox(height: 24), const ListTile(leading: Icon(Icons.info_outline, color: accent), title: Text('About Sports 803'), subtitle: Text('Premium live sports streaming', style: TextStyle(color: muted))), const ListTile(leading: Icon(Icons.dark_mode_outlined, color: accent), title: Text('Dark mode'), subtitle: Text('Always on for the best match-day experience', style: TextStyle(color: muted))), const ListTile(leading: Icon(Icons.privacy_tip_outlined, color: accent), title: Text('Privacy'), subtitle: Text('No account required', style: TextStyle(color: muted))), const Spacer(), Center(child: Text('SPORTS 803  •  v1.0.0', style: TextStyle(color: muted, fontSize: 12, letterSpacing: 1.3)))]))); }

class EmptyState extends StatelessWidget { const EmptyState({super.key, this.label = 'No live events right now'}); final String label; @override Widget build(BuildContext context) => Padding(padding: const EdgeInsets.all(55), child: Column(children: [Icon(Icons.sports_score, color: muted.withOpacity(.55), size: 54), const SizedBox(height: 14), Text(label, style: const TextStyle(color: muted, fontWeight: FontWeight.w600)), const SizedBox(height: 5), const Text('Pull down to refresh', style: TextStyle(color: muted, fontSize: 12))])); }

class AdBanner extends StatefulWidget { const AdBanner({super.key, required this.unitId}); final String unitId; @override State<AdBanner> createState() => _AdBannerState(); }
class _AdBannerState extends State<AdBanner> { BannerAd? ad; @override void initState() { super.initState(); ad = BannerAd(adUnitId: widget.unitId, request: const AdRequest(), size: AdSize.banner, listener: BannerAdListener(onAdFailedToLoad: (ad, _) => ad.dispose()))..load(); } @override void dispose() { ad?.dispose(); super.dispose(); } @override Widget build(BuildContext context) => ad == null ? const SizedBox(height: 50) : SizedBox(height: 50, width: double.infinity, child: AdWidget(ad: ad!)); }
