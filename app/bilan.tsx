import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AppShell } from '../src/components/app-shell';
import { DateField } from '../src/components/date-field';
import { useTheme, useThemePreferences } from '../src/theme/theme-provider';
import { fonts, radii, spacing } from '../src/theme/tokens';
import { MOOD_COLORS, getMoodColor } from '../src/theme/score-colors';
import { saveJournalEntry, listTreatments, saveBook } from '../src/db/repositories';
import { saveSleepEntry, savePhysicalActivity, saveGame, saveCountry, saveConcert } from '../src/db/module-repositories';
import type { SleepEntry, PhysicalActivity, Treatment, JournalEntry, GameStatus, CountryRegion, BookStatus } from '../src/db/types';
import { useThemedStyles } from '../src/theme/use-themed-styles';

function localDay(value = new Date()) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

type StepType = 'selection' | 'journal' | 'sommeil' | 'activite' | 'traitements' | 'substances' | 'jeux' | 'livres' | 'concerts' | 'pays' | 'recap';

export default function BilanScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useThemePreferences();
  const styles = useThemedStyles(createStyles);

  const [selectedDate, setSelectedDate] = useState<string>(localDay());
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);

  // Core tracking selection
  const [modulesToTrack, setModulesToTrack] = useState({
    journal: true,
    sommeil: true,
    activite: true,
    traitements: true,
    substances: false,
    jeux: false,
    livres: false,
    concerts: false,
    pays: false,
  });

  // State values for each module
  // Journal
  const [journalMood, setJournalMood] = useState<number>(3);
  const [journalText, setJournalText] = useState<string>('');
  const [journalTags, setJournalTags] = useState<string>('');

  // Sleep
  const [sleepId, setSleepId] = useState<string | null>(null);
  const [sleepBedtime, setSleepBedtime] = useState<string>('23:30');
  const [sleepWakeTime, setSleepWakeTime] = useState<string>('07:30');
  const [sleepQuality, setSleepQuality] = useState<number>(3);
  const [sleepNotes, setSleepNotes] = useState<string>('');

  // Physical Activity
  const [activityId, setActivityId] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<string>('Marche');
  const [activityDuration, setActivityDuration] = useState<string>('30');
  const [activityIntensity, setActivityIntensity] = useState<number>(3);
  const [activityNotes, setActivityNotes] = useState<string>('');

  // Treatments
  const [allTreatments, setAllTreatments] = useState<Treatment[]>([]);
  const [treatmentsTaken, setTreatmentsTaken] = useState<Record<string, boolean>>({});

  // Substances/Prises
  const [substanceName, setSubstanceName] = useState<string>('');
  const [substanceDose, setSubstanceDose] = useState<string>('');
  const [substanceUnit, setSubstanceUnit] = useState<string>('mg');
  const [substanceRoute, setSubstanceRoute] = useState<string>('Orale');
  const [substanceFeel, setSubstanceFeel] = useState<number>(3);
  const [substanceNotes, setSubstanceNotes] = useState<string>('');

  // Jeux (Games)
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameName, setGameName] = useState<string>('');
  const [gamePlatform, setGamePlatform] = useState<string>('');
  const [gameStatus, setGameStatus] = useState<GameStatus>('fini');
  const [gameRating, setGameRating] = useState<number>(3);
  const [gameNotes, setGameNotes] = useState<string>('');

  // Livres (Books)
  const [bookId, setBookId] = useState<string | null>(null);
  const [bookName, setBookName] = useState<string>('');
  const [bookAuthor, setBookAuthor] = useState<string>('');
  const [bookStatus, setBookStatus] = useState<BookStatus>('lu');
  const [bookRating, setBookRating] = useState<number>(3);
  const [bookNotes, setBookNotes] = useState<string>('');

  // Concerts
  const [concertId, setConcertId] = useState<string | null>(null);
  const [concertName, setConcertName] = useState<string>('');
  const [concertVenue, setConcertVenue] = useState<string>('');
  const [concertRating, setConcertRating] = useState<number>(3);
  const [concertNotes, setConcertNotes] = useState<string>('');

  // Pays (Countries)
  const [countryId, setCountryId] = useState<string | null>(null);
  const [countryName, setCountryName] = useState<string>('');
  const [countryCity, setCountryCity] = useState<string>('');
  const [countryRegion, setCountryRegion] = useState<CountryRegion>('europe');
  const [countryRating, setCountryRating] = useState<number>(3);
  const [countryNotes, setCountryNotes] = useState<string>('');

  // Dynamic suggestions lists based on history
  const [substanceHistory, setSubstanceHistory] = useState<string[]>([]);
  const [activityHistory, setActivityHistory] = useState<string[]>([]);
  const [gameHistory, setGameHistory] = useState<string[]>([]);
  const [gamePlatformHistory, setGamePlatformHistory] = useState<string[]>([]);
  const [bookHistory, setBookHistory] = useState<string[]>([]);
  const [bookAuthorHistory, setBookAuthorHistory] = useState<string[]>([]);
  const [concertHistory, setConcertHistory] = useState<string[]>([]);
  const [concertVenueHistory, setConcertVenueHistory] = useState<string[]>([]);
  const [countryHistory, setCountryHistory] = useState<string[]>([]);
  const [countryCityHistory, setCountryCityHistory] = useState<string[]>([]);

  // Function to load all previously used items distinct entries
  const loadSuggestionsHistory = useCallback(async () => {
    try {
      // 1. Substances
      const subs = await db.getAllAsync<{ name: string }>(
        'SELECT DISTINCT name FROM substances WHERE name != "" ORDER BY name ASC'
      );
      const doseSubs = await db.getAllAsync<{ substance: string }>(
        'SELECT DISTINCT substance FROM doses WHERE substance != "" ORDER BY substance ASC'
      );
      const combinedSubs = Array.from(new Set([
        ...subs.map(s => s.name),
        ...doseSubs.map(d => d.substance)
      ])).sort();
      setSubstanceHistory(combinedSubs);

      // 2. Activities
      const acts = await db.getAllAsync<{ activity_type: string }>(
        'SELECT DISTINCT activity_type FROM physical_activities WHERE activity_type != "" ORDER BY activity_type ASC'
      );
      setActivityHistory(acts.map(a => a.activity_type));

      // 3. Games & platforms
      const gms = await db.getAllAsync<{ name: string }>(
        'SELECT DISTINCT name FROM games WHERE name != "" ORDER BY name ASC'
      );
      setGameHistory(gms.map(g => g.name));

      const gPlats = await db.getAllAsync<{ platform: string }>(
        'SELECT DISTINCT platform FROM games WHERE platform != "" ORDER BY platform ASC'
      );
      setGamePlatformHistory(gPlats.map(gp => gp.platform));

      // 4. Books & Authors
      const bks = await db.getAllAsync<{ name: string }>(
        'SELECT DISTINCT name FROM books WHERE name != "" ORDER BY name ASC'
      );
      setBookHistory(bks.map(b => b.name));

      const bAuths = await db.getAllAsync<{ author: string }>(
        'SELECT DISTINCT author FROM books WHERE author != "" ORDER BY author ASC'
      );
      setBookAuthorHistory(bAuths.map(ba => ba.author));

      // 5. Concerts & Venues
      const concs = await db.getAllAsync<{ name: string }>(
        'SELECT DISTINCT name FROM concerts WHERE name != "" ORDER BY name ASC'
      );
      setConcertHistory(concs.map(c => c.name));

      const concVenues = await db.getAllAsync<{ venue: string }>(
        'SELECT DISTINCT venue FROM concerts WHERE venue != "" ORDER BY venue ASC'
      );
      setConcertVenueHistory(concVenues.map(cv => cv.venue));

      // 6. Countries & Cities
      const countries = await db.getAllAsync<{ name: string }>(
        'SELECT DISTINCT name FROM countries WHERE name != "" ORDER BY name ASC'
      );
      setCountryHistory(countries.map(c => c.name));

      const cities = await db.getAllAsync<{ city: string }>(
        'SELECT DISTINCT city FROM countries WHERE city != "" ORDER BY city ASC'
      );
      setCountryCityHistory(cities.map(ct => ct.city));

    } catch (e) {
      console.error("Erreur de chargement de l'historique : ", e);
    }
  }, [db]);

  useEffect(() => {
    void loadSuggestionsHistory();
  }, [loadSuggestionsHistory]);

  // Keep a mutable reference so state setters in async calls don't read stale values
  const currentModulesToTrackRef = useRef(modulesToTrack);
  useEffect(() => {
    currentModulesToTrackRef.current = modulesToTrack;
  }, [modulesToTrack]);

  // Load existing data for selectedDate
  const loadDataForDate = useCallback(async (date: string) => {
    setLoading(true);
    try {
      // 1. Journal entry
      const existingJournal = await db.getFirstAsync<any>(
        'SELECT * FROM journal_entries WHERE date = ?',
        date
      );
      if (existingJournal) {
        setJournalMood(existingJournal.mood);
        setJournalText(existingJournal.text || '');
        let tags: string[] = [];
        try {
          tags = JSON.parse(existingJournal.tags_json || '[]');
        } catch {
          // ignore parsing error
        }
        setJournalTags(tags.join(', '));
        setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, journal: true }));
      } else {
        setJournalMood(3);
        setJournalText('');
        setJournalTags('');
      }

      // 2. Sleep entry
      const existingSleep = await db.getFirstAsync<any>(
        'SELECT * FROM sleep_entries WHERE date = ?',
        date
      );
      if (existingSleep) {
        setSleepId(existingSleep.id);
        setSleepBedtime(existingSleep.bedtime || '23:30');
        setSleepWakeTime(existingSleep.wake_time || '07:30');
        setSleepQuality(existingSleep.quality);
        setSleepNotes(existingSleep.notes || '');
        setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, sommeil: true }));
      } else {
        setSleepId(null);
        setSleepBedtime('23:30');
        setSleepWakeTime('07:30');
        setSleepQuality(3);
        setSleepNotes('');
      }

      // 3. Physical activity entry
      const existingActivity = await db.getFirstAsync<any>(
        'SELECT * FROM physical_activities WHERE date = ? LIMIT 1',
        date
      );
      if (existingActivity) {
        setActivityId(existingActivity.id);
        setActivityType(existingActivity.activity_type || 'Marche');
        setActivityDuration(String(existingActivity.duration_minutes ?? 30));
        setActivityIntensity(existingActivity.intensity ?? 3);
        setActivityNotes(existingActivity.notes || '');
        setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, activite: true }));
      } else {
        setActivityId(null);
        setActivityType('Marche');
        setActivityDuration('30');
        setActivityIntensity(3);
        setActivityNotes('');
      }

      // 4. Treatments
      const list = await listTreatments(db);
      setAllTreatments(list);
      const takenRecord: Record<string, boolean> = {};
      list.forEach((t) => {
        takenRecord[t.id] = t.takenDays.includes(date);
      });
      setTreatmentsTaken(takenRecord);
      if (list.length > 0) {
        setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, traitements: true }));
      }

      // 5. Substances
      if (preferences.showSensitiveContent) {
        const existingDose = await db.getFirstAsync<any>(
          "SELECT * FROM doses WHERE strftime('%Y-%m-%d', datetime) = ? ORDER BY datetime DESC LIMIT 1",
          date
        );
        if (existingDose) {
          setSubstanceName(existingDose.substance || '');
          setSubstanceDose(existingDose.dose || '');
          setSubstanceUnit(existingDose.unit || 'mg');
          setSubstanceRoute(existingDose.route || 'Orale');
          setSubstanceFeel(existingDose.feel || 3);
          setSubstanceNotes(existingDose.notes || '');
          setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, substances: true }));
        } else {
          setSubstanceName('');
          setSubstanceDose('');
          setSubstanceUnit('mg');
          setSubstanceRoute('Orale');
          setSubstanceFeel(3);
          setSubstanceNotes('');
        }
      }

      // 6. Games (Jeux)
      const existingGame = await db.getFirstAsync<any>(
        'SELECT * FROM games WHERE date = ? LIMIT 1',
        date
      );
      if (existingGame) {
        setGameId(existingGame.id);
        setGameName(existingGame.name || '');
        setGamePlatform(existingGame.platform || '');
        setGameStatus((existingGame.status as GameStatus) || 'fini');
        setGameRating(existingGame.rating || 3);
        setGameNotes(existingGame.notes || '');
        setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, jeux: true }));
      } else {
        setGameId(null);
        setGameName('');
        setGamePlatform('');
        setGameStatus('fini');
        setGameRating(3);
        setGameNotes('');
      }

      // 7. Books (Livres)
      const existingBook = await db.getFirstAsync<any>(
        'SELECT * FROM books WHERE date = ? LIMIT 1',
        date
      );
      if (existingBook) {
        setBookId(existingBook.id);
        setBookName(existingBook.name || '');
        setBookAuthor(existingBook.author || '');
        setBookStatus((existingBook.status as BookStatus) || 'lu');
        setBookRating(existingBook.rating || 3);
        setBookNotes(existingBook.notes || '');
        setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, livres: true }));
      } else {
        setBookId(null);
        setBookName('');
        setBookAuthor('');
        setBookStatus('lu');
        setBookRating(3);
        setBookNotes('');
      }

      // 8. Concerts
      const existingConcert = await db.getFirstAsync<any>(
        'SELECT * FROM concerts WHERE date = ? LIMIT 1',
        date
      );
      if (existingConcert) {
        setConcertId(existingConcert.id);
        setConcertName(existingConcert.name || '');
        setConcertVenue(existingConcert.venue || '');
        setConcertRating(existingConcert.rating || 3);
        setConcertNotes(existingConcert.notes || '');
        setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, concerts: true }));
      } else {
        setConcertId(null);
        setConcertName('');
        setConcertVenue('');
        setConcertRating(3);
        setConcertNotes('');
      }

      // 9. Countries (Pays)
      const existingCountry = await db.getFirstAsync<any>(
        "SELECT * FROM countries WHERE strftime('%Y-%m-%d', datetime(created_at / 1000, 'unixepoch', 'localtime')) = ? LIMIT 1",
        date
      );
      if (existingCountry) {
        setCountryId(existingCountry.id);
        setCountryName(existingCountry.name || '');
        setCountryCity(existingCountry.city || '');
        setCountryRegion((existingCountry.region as CountryRegion) || 'europe');
        setCountryRating(existingCountry.rating || 3);
        setCountryNotes(existingCountry.notes || '');
        setModulesToTrack((prev) => ({ ...currentModulesToTrackRef.current, pays: true }));
      } else {
        setCountryId(null);
        setCountryName('');
        setCountryCity('');
        setCountryRegion('europe');
        setCountryRating(3);
        setCountryNotes('');
      }

    } catch (e) {
      console.error("Erreur lors de la lecture du bilan : ", e);
    } finally {
      setLoading(false);
    }
  }, [db, preferences.showSensitiveContent]);

  // Initialize and reload on date change
  useEffect(() => {
    void loadDataForDate(selectedDate);
  }, [selectedDate, loadDataForDate]);

  // Dynamic active steps list
  const activeSteps = useMemo<StepType[]>(() => {
    const list: StepType[] = ['selection'];
    if (modulesToTrack.journal) list.push('journal');
    if (modulesToTrack.sommeil) list.push('sommeil');
    if (modulesToTrack.activite) list.push('activite');
    if (modulesToTrack.traitements && allTreatments.length > 0) list.push('traitements');
    if (modulesToTrack.substances && preferences.showSensitiveContent) list.push('substances');
    if (modulesToTrack.jeux) list.push('jeux');
    if (modulesToTrack.livres) list.push('livres');
    if (modulesToTrack.concerts) list.push('concerts');
    if (modulesToTrack.pays) list.push('pays');
    list.push('recap');
    return list;
  }, [modulesToTrack, allTreatments.length, preferences.showSensitiveContent]);

  const currentStep = activeSteps[currentStepIndex] || 'selection';

  const handleNext = () => {
    if (currentStepIndex < activeSteps.length - 1) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 1. Save Journal
      if (modulesToTrack.journal) {
        const tagsArray = journalTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        await saveJournalEntry(db, {
          date: selectedDate,
          mood: journalMood,
          text: journalText,
          tags: tagsArray,
        });
      }

      // 2. Save Sleep
      if (modulesToTrack.sommeil) {
        await saveSleepEntry(db, {
          id: sleepId || undefined,
          date: selectedDate,
          bedtime: sleepBedtime,
          wakeTime: sleepWakeTime,
          quality: sleepQuality,
          notes: sleepNotes,
        });
      }

      // 3. Save Physical Activity
      if (modulesToTrack.activite) {
        const parsedMinutes = Number.parseInt(activityDuration.replace(/\D/g, ''), 10) || 0;
        await savePhysicalActivity(db, {
          id: activityId || undefined,
          date: selectedDate,
          activityType,
          durationMinutes: parsedMinutes,
          intensity: activityIntensity,
          notes: activityNotes,
        });
      }

      // 4. Save Treatments
      if (modulesToTrack.traitements) {
        // Clear logs for selectedDate
        await db.runAsync('DELETE FROM treatment_logs WHERE day = ?', selectedDate);
        // Insert logs for selectedDate
        for (const [tId, taken] of Object.entries(treatmentsTaken)) {
          if (taken) {
            await db.runAsync(
              'INSERT INTO treatment_logs (treatment_id, day) VALUES (?, ?)',
              tId,
              selectedDate
            );
          }
        }
      }

      // 5. Save Substances
      if (modulesToTrack.substances && preferences.showSensitiveContent && substanceName.trim()) {
        const categoryId = 'autre';
        const substanceExists = await db.getFirstAsync<any>(
          'SELECT name FROM substances WHERE name = ? COLLATE NOCASE',
          substanceName.trim()
        );
        if (!substanceExists) {
          await db.runAsync(
            'INSERT INTO substances (name, category, first_tried) VALUES (?, ?, ?)',
            substanceName.trim(),
            categoryId,
            selectedDate
          );
        }

        // Save dose
        await db.runAsync(
          `INSERT INTO doses (id, substance, datetime, dose, unit, route, feel, notes, context_tags_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `dose-${Date.now()}`,
          substanceName.trim(),
          `${selectedDate}T${new Date().toTimeString().slice(0, 5)}:00Z`,
          substanceDose.trim(),
          substanceUnit.trim(),
          substanceRoute.trim(),
          substanceFeel,
          substanceNotes.trim(),
          JSON.stringify(['bilan-quotidien']),
          Date.now()
        );
      }

      // 6. Save Games (Jeux)
      if (modulesToTrack.jeux && gameName.trim()) {
        await saveGame(db, {
          id: gameId || undefined,
          name: gameName,
          platform: gamePlatform,
          status: gameStatus,
          rating: gameRating,
          date: selectedDate,
          notes: gameNotes,
        });
      }

      // 7. Save Books (Livres)
      if (modulesToTrack.livres && bookName.trim()) {
        await saveBook(db, {
          id: bookId || undefined,
          name: bookName,
          author: bookAuthor,
          status: bookStatus,
          rating: bookRating,
          date: selectedDate,
          notes: bookNotes,
        });
      }

      // 8. Save Concerts
      if (modulesToTrack.concerts && concertName.trim()) {
        await saveConcert(db, {
          id: concertId || undefined,
          name: concertName,
          venue: concertVenue,
          rating: concertRating,
          date: selectedDate,
          notes: concertNotes,
        });
      }

      // 9. Save Countries (Pays)
      if (modulesToTrack.pays && countryName.trim()) {
        await saveCountry(db, {
          id: countryId || undefined,
          name: countryName,
          city: countryCity,
          region: countryRegion,
          rating: countryRating,
          year: selectedDate.slice(0, 4), // Store year string
          notes: countryNotes,
        });
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setSuccess(true);
      setTimeout(() => {
        router.replace('/');
      }, 1500);
    } catch (e) {
      console.error("Erreur lors de la sauvegarde complète : ", e);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 'selection':
        return 'Votre journée';
      case 'journal':
        return 'Humeur & Journal';
      case 'sommeil':
        return 'Sommeil & Nuit';
      case 'activite':
        return 'Activité physique';
      case 'traitements':
        return 'Traitements';
      case 'substances':
        return 'Prises / Conso';
      case 'jeux':
        return 'Jeux vidéo / Société';
      case 'livres':
        return 'Lecture & Livres';
      case 'concerts':
        return 'Concerts & Événements';
      case 'pays':
        return 'Pays & Voyages';
      case 'recap':
        return 'Résumé & Validation';
      default:
        return 'Bilan du jour';
    }
  };

  if (success) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successBadge}>
          <Ionicons name="checkmark-circle" size={80} color={colors.success} />
          <Text style={styles.successTitle}>Bilan Enregistré !</Text>
          <Text style={styles.successSubtitle}>Votre carnet est à jour. Retour à l'accueil...</Text>
        </View>
      </View>
    );
  }

  return (
    <AppShell kicker="Rituel Quotidien" title={getStepTitle()}>
      
      {/* Date picking, available on the first step */}
      {currentStep === 'selection' ? (
        <View style={styles.dateSelectorContainer}>
          <DateField
            label="Jour du bilan"
            value={selectedDate}
            onChange={(val) => {
              setSelectedDate(val);
              setCurrentStepIndex(0);
            }}
          />
        </View>
      ) : (
        <View style={styles.dateHeaderBadge}>
          <Ionicons name="calendar-outline" size={14} color={colors.accent} />
          <Text style={styles.dateHeaderBadgeText}>
            Pour le : {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Text>
        </View>
      )}

      {/* Loading state indicator */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Récupération de vos données...</Text>
        </View>
      ) : (
        <ScrollView style={styles.stepContentScroll} contentContainerStyle={styles.stepScrollContent}>
          
          {/* STEP 0: SELECTION */}
          {currentStep === 'selection' && (
            <View style={styles.stepSection}>
              <Text style={styles.sectionSubtitle}>
                Cochez tout ce qui concerne votre journée. Nous remplirons les détails de chaque élément sélectionné.
              </Text>

              <View style={styles.selectionGrid}>
                {/* Journal */}
                <Pressable
                  onPress={() => setModulesToTrack(p => ({ ...p, journal: !p.journal }))}
                  style={[styles.selectionCard, modulesToTrack.journal && styles.selectionCardActive]}
                >
                  <View style={[styles.selectionCheckbox, modulesToTrack.journal && styles.selectionCheckboxActive]}>
                    {modulesToTrack.journal && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Ionicons name="book-outline" size={24} color={modulesToTrack.journal ? colors.accent : colors.muted} />
                  <View style={styles.selectionInfo}>
                    <Text style={styles.selectionTitle}>Humeur & Journal</Text>
                    <Text style={styles.selectionDesc}>Niveau de moral et récit de vos péripéties</Text>
                  </View>
                </Pressable>

                {/* Sleep */}
                <Pressable
                  onPress={() => setModulesToTrack(p => ({ ...p, sommeil: !p.sommeil }))}
                  style={[styles.selectionCard, modulesToTrack.sommeil && styles.selectionCardActive]}
                >
                  <View style={[styles.selectionCheckbox, modulesToTrack.sommeil && styles.selectionCheckboxActive]}>
                    {modulesToTrack.sommeil && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Ionicons name="bed-outline" size={24} color={modulesToTrack.sommeil ? colors.accent : colors.muted} />
                  <View style={styles.selectionInfo}>
                    <Text style={styles.selectionTitle}>Sommeil</Text>
                    <Text style={styles.selectionDesc}>Heures de coucher/lever et qualité du repos</Text>
                  </View>
                </Pressable>

                {/* Physical Activity */}
                <Pressable
                  onPress={() => setModulesToTrack(p => ({ ...p, activite: !p.activite }))}
                  style={[styles.selectionCard, modulesToTrack.activite && styles.selectionCardActive]}
                >
                  <View style={[styles.selectionCheckbox, modulesToTrack.activite && styles.selectionCheckboxActive]}>
                    {modulesToTrack.activite && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Ionicons name="fitness-outline" size={24} color={modulesToTrack.activite ? colors.accent : colors.muted} />
                  <View style={styles.selectionInfo}>
                    <Text style={styles.selectionTitle}>Activité physique</Text>
                    <Text style={styles.selectionDesc}>Séance de sport, marche d'oxygénation, etc.</Text>
                  </View>
                </Pressable>

                {/* Traitements */}
                {allTreatments.length > 0 && (
                  <Pressable
                    onPress={() => setModulesToTrack(p => ({ ...p, traitements: !p.traitements }))}
                    style={[styles.selectionCard, modulesToTrack.traitements && styles.selectionCardActive]}
                  >
                    <View style={[styles.selectionCheckbox, modulesToTrack.traitements && styles.selectionCheckboxActive]}>
                      {modulesToTrack.traitements && <Ionicons name="checkmark" size={14} color={colors.white} />}
                    </View>
                    <Ionicons name="medical-outline" size={24} color={modulesToTrack.traitements ? colors.accent : colors.muted} />
                    <View style={styles.selectionInfo}>
                      <Text style={styles.selectionTitle}>Traitements</Text>
                      <Text style={styles.selectionDesc}>Cocher vos médicaments ou prescriptions</Text>
                    </View>
                  </Pressable>
                )}

                {/* Substances (conso) */}
                {preferences.showSensitiveContent && (
                  <Pressable
                    onPress={() => setModulesToTrack(p => ({ ...p, substances: !p.substances }))}
                    style={[styles.selectionCard, modulesToTrack.substances && styles.selectionCardActive]}
                  >
                    <View style={[styles.selectionCheckbox, modulesToTrack.substances && styles.selectionCheckboxActive]}>
                      {modulesToTrack.substances && <Ionicons name="checkmark" size={14} color={colors.white} />}
                    </View>
                    <Ionicons name="cafe-outline" size={24} color={modulesToTrack.substances ? colors.accent : colors.muted} />
                    <View style={styles.selectionInfo}>
                      <Text style={styles.selectionTitle}>Prises / Conso</Text>
                      <Text style={styles.selectionDesc}>Café, compléments, substances, dosages</Text>
                    </View>
                  </Pressable>
                )}

                {/* Jeux */}
                <Pressable
                  onPress={() => setModulesToTrack(p => ({ ...p, jeux: !p.jeux }))}
                  style={[styles.selectionCard, modulesToTrack.jeux && styles.selectionCardActive]}
                >
                  <View style={[styles.selectionCheckbox, modulesToTrack.jeux && styles.selectionCheckboxActive]}>
                    {modulesToTrack.jeux && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Ionicons name="game-controller-outline" size={24} color={modulesToTrack.jeux ? colors.accent : colors.muted} />
                  <View style={styles.selectionInfo}>
                    <Text style={styles.selectionTitle}>Jeux vidéo / Société</Text>
                    <Text style={styles.selectionDesc}>Une session de gaming ou de party-game</Text>
                  </View>
                </Pressable>

                {/* Livres */}
                <Pressable
                  onPress={() => setModulesToTrack(p => ({ ...p, livres: !p.livres }))}
                  style={[styles.selectionCard, modulesToTrack.livres && styles.selectionCardActive]}
                >
                  <View style={[styles.selectionCheckbox, modulesToTrack.livres && styles.selectionCheckboxActive]}>
                    {modulesToTrack.livres && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Ionicons name="bookmarks-outline" size={24} color={modulesToTrack.livres ? colors.accent : colors.muted} />
                  <View style={styles.selectionInfo}>
                    <Text style={styles.selectionTitle}>Lecture & Livres</Text>
                    <Text style={styles.selectionDesc}>Enregistrer une lecture de roman, essai...</Text>
                  </View>
                </Pressable>

                {/* Concerts */}
                <Pressable
                  onPress={() => setModulesToTrack(p => ({ ...p, concerts: !p.concerts }))}
                  style={[styles.selectionCard, modulesToTrack.concerts && styles.selectionCardActive]}
                >
                  <View style={[styles.selectionCheckbox, modulesToTrack.concerts && styles.selectionCheckboxActive]}>
                    {modulesToTrack.concerts && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Ionicons name="musical-notes-outline" size={24} color={modulesToTrack.concerts ? colors.accent : colors.muted} />
                  <View style={styles.selectionInfo}>
                    <Text style={styles.selectionTitle}>Concerts & Événements</Text>
                    <Text style={styles.selectionDesc}>Assister à un show, concert ou soirée live</Text>
                  </View>
                </Pressable>

                {/* Pays */}
                <Pressable
                  onPress={() => setModulesToTrack(p => ({ ...p, pays: !p.pays }))}
                  style={[styles.selectionCard, modulesToTrack.pays && styles.selectionCardActive]}
                >
                  <View style={[styles.selectionCheckbox, modulesToTrack.pays && styles.selectionCheckboxActive]}>
                    {modulesToTrack.pays && <Ionicons name="checkmark" size={14} color={colors.white} />}
                  </View>
                  <Ionicons name="earth-outline" size={24} color={modulesToTrack.pays ? colors.accent : colors.muted} />
                  <View style={styles.selectionInfo}>
                    <Text style={styles.selectionTitle}>Pays & Voyages</Text>
                    <Text style={styles.selectionDesc}>Visiter ou mémoriser un lieu de voyage</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          )}

          {/* STEP: JOURNAL */}
          {currentStep === 'journal' && (
            <View style={styles.stepSection}>
              <Text style={styles.fieldLabel}>Comment s'est passée votre journée ?</Text>
              <View style={styles.moodSelectorGrid}>
                {[1, 2, 3, 4, 5].map((val) => {
                  const isActive = journalMood === val;
                  const color = MOOD_COLORS[val as keyof typeof MOOD_COLORS];
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setJournalMood(val)}
                      style={[
                        styles.moodButton,
                        isActive && { backgroundColor: color, borderColor: color }
                      ]}
                    >
                      <Text style={[styles.moodButtonLabel, isActive && styles.moodButtonLabelActive]}>
                        {val === 1 ? '😟 1' : val === 2 ? '😐 2' : val === 3 ? '🙂 3' : val === 4 ? '😀 4' : '🤩 5'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Racontez votre journée (Journal)</Text>
              <TextInput
                multiline
                placeholder="Renseignez vos pensées, actualités, exploits ou notes positives..."
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                value={journalText}
                onChangeText={setJournalText}
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Tags (séparés par des virgules)</Text>
              <TextInput
                placeholder="ex. productif, fatigué, famille"
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={journalTags}
                onChangeText={setJournalTags}
              />
            </View>
          )}

          {/* STEP: SLEEP */}
          {currentStep === 'sommeil' && (
            <View style={styles.stepSection}>
              <Text style={styles.fieldLabel}>Heures de coucher & de lever</Text>
              <View style={styles.timeInputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subFieldLabel}>Heure de coucher</Text>
                  <TextInput
                    placeholder="23:30"
                    placeholderTextColor={colors.muted}
                    style={styles.inputField}
                    value={sleepBedtime}
                    onChangeText={setSleepBedtime}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subFieldLabel}>Heure de lever</Text>
                  <TextInput
                    placeholder="07:30"
                    placeholderTextColor={colors.muted}
                    style={styles.inputField}
                    value={sleepWakeTime}
                    onChangeText={setSleepWakeTime}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Qualité de la nuit</Text>
              <View style={styles.moodSelectorGrid}>
                {[1, 2, 3, 4, 5].map((val) => {
                  const isActive = sleepQuality === val;
                  const color = MOOD_COLORS[val as keyof typeof MOOD_COLORS];
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setSleepQuality(val)}
                      style={[
                        styles.moodButton,
                        isActive && { backgroundColor: color, borderColor: color }
                      ]}
                    >
                      <Text style={[styles.moodButtonLabel, isActive && styles.moodButtonLabelActive]}>
                        {val === 1 ? '💀' : val === 2 ? '🥱' : val === 3 ? '🏡' : val === 4 ? '⚡' : '🚀'} {val}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Notes de sommeil</Text>
              <TextInput
                multiline
                placeholder="Rêves, réveils nocturnes, commentaires libres..."
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                value={sleepNotes}
                onChangeText={setSleepNotes}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* STEP: PHYSICAL ACTIVITY */}
          {currentStep === 'activite' && (
            <View style={styles.stepSection}>
              <Text style={styles.fieldLabel}>Type d'activité physique</Text>
              <TextInput
                placeholder="ex. Marche, Course, Vélo, Musculation, Natation..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={activityType}
                onChangeText={setActivityType}
              />
              <View style={styles.chipsSuggestRow}>
                {Array.from(new Set(['Marche', 'Course', 'Vélo', 'Muscu', 'Natation', 'Yoga', ...activityHistory])).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setActivityType(type)}
                    style={styles.suggestChip}
                  >
                    <Text style={styles.suggestChipLabel}>{type}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Durée (en minutes)</Text>
              <TextInput
                placeholder="30"
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={activityDuration}
                onChangeText={setActivityDuration}
                keyboardType="number-pad"
              />

              <Text style={styles.fieldLabel}>Intensité / Ressenti</Text>
              <View style={styles.moodSelectorGrid}>
                {[1, 2, 3, 4, 5].map((val) => {
                  const isActive = activityIntensity === val;
                  const color = MOOD_COLORS[val as keyof typeof MOOD_COLORS];
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setActivityIntensity(val)}
                      style={[
                        styles.moodButton,
                        isActive && { backgroundColor: color, borderColor: color }
                      ]}
                    >
                      <Text style={[styles.moodButtonLabel, isActive && styles.moodButtonLabelActive]}>
                        Niveau {val}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Notes sur la séance</Text>
              <TextInput
                multiline
                placeholder="Sensations, parcours, météo, performances..."
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                value={activityNotes}
                onChangeText={setActivityNotes}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* STEP: TREATMENTS */}
          {currentStep === 'traitements' && (
            <View style={styles.stepSection}>
              <Text style={styles.sectionSubtitle}>
                Cochez les prescriptions que vous avez prises aujourd'hui :
              </Text>

              <View style={styles.treatmentList}>
                {allTreatments.map((treatment) => {
                  const isTaken = !!treatmentsTaken[treatment.id];
                  return (
                    <Pressable
                      key={treatment.id}
                      onPress={() => {
                        void Haptics.selectionAsync().catch(() => undefined);
                        setTreatmentsTaken((prev) => ({
                          ...prev,
                          [treatment.id]: !prev[treatment.id],
                        }));
                      }}
                      style={[styles.treatmentCheckCard, isTaken && styles.treatmentCheckCardActive]}
                    >
                      <View style={[styles.treatmentCheckbox, isTaken && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                        {isTaken && <Ionicons name="checkmark" size={14} color={colors.white} />}
                      </View>
                      <View style={styles.treatmentTextRow}>
                        <Text style={styles.treatmentNameText}>{treatment.name}</Text>
                        {treatment.dose ? <Text style={styles.treatmentDoseText}>{treatment.dose}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP: SUBSTANCES */}
          {currentStep === 'substances' && (
            <View style={styles.stepSection}>
              <Text style={styles.fieldLabel}>Nom de la substance</Text>
              <TextInput
                placeholder="ex. Caféine, CBD, Paracétamol..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={substanceName}
                onChangeText={setSubstanceName}
              />
              <View style={styles.chipsSuggestRow}>
                {Array.from(new Set(['Caféine', 'Théine', 'CBD', 'Alcool', 'Nicotine', ...substanceHistory])).map((sub) => (
                  <Pressable
                    key={sub}
                    onPress={() => setSubstanceName(sub)}
                    style={styles.suggestChip}
                  >
                    <Text style={styles.suggestChipLabel}>{sub}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.timeInputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subFieldLabel}>Quantité / Dose</Text>
                  <TextInput
                    placeholder="100"
                    placeholderTextColor={colors.muted}
                    style={styles.inputField}
                    value={substanceDose}
                    onChangeText={setSubstanceDose}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subFieldLabel}>Unité</Text>
                  <TextInput
                    placeholder="mg"
                    placeholderTextColor={colors.muted}
                    style={styles.inputField}
                    value={substanceUnit}
                    onChangeText={setSubstanceUnit}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Voie d'administration</Text>
              <View style={styles.chipsSuggestRow}>
                {['Orale', 'Sublinguale', 'Inhalée', 'Nasale', 'Cutanée', 'Injection'].map((route) => {
                  const isActive = substanceRoute === route;
                  return (
                    <Pressable
                      key={route}
                      onPress={() => setSubstanceRoute(route)}
                      style={[styles.suggestChip, isActive && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                    >
                      <Text style={[styles.suggestChipLabel, isActive && { color: colors.white }]}>{route}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                placeholder="Ou autre voie d'administration..."
                placeholderTextColor={colors.muted}
                style={[styles.inputField, { marginTop: spacing.xs }]}
                value={substanceRoute}
                onChangeText={setSubstanceRoute}
              />

              <Text style={styles.fieldLabel}>Ressenti / Effet</Text>
              <View style={styles.moodSelectorGrid}>
                {[1, 2, 3, 4, 5].map((val) => {
                  const isActive = substanceFeel === val;
                  const color = MOOD_COLORS[val as keyof typeof MOOD_COLORS];
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setSubstanceFeel(val)}
                      style={[
                        styles.moodButton,
                        isActive && { backgroundColor: color, borderColor: color }
                      ]}
                    >
                      <Text style={[styles.moodButtonLabel, isActive && styles.moodButtonLabelActive]}>
                        Niveau {val}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Notes / Contexte</Text>
              <TextInput
                multiline
                placeholder="Pourquoi ? Sensations particulières ?"
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                value={substanceNotes}
                onChangeText={setSubstanceNotes}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* STEP: JEUX */}
          {currentStep === 'jeux' && (
            <View style={styles.stepSection}>
              <Text style={styles.fieldLabel}>Titre du jeu</Text>
              <TextInput
                placeholder="ex. The Witcher 3, Échecs, Catan..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={gameName}
                onChangeText={setGameName}
              />
              {gameHistory.length > 0 && (
                <View style={styles.chipsSuggestRow}>
                  {gameHistory.map((game) => (
                    <Pressable
                      key={game}
                      onPress={() => setGameName(game)}
                      style={styles.suggestChip}
                    >
                      <Text style={styles.suggestChipLabel}>{game}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Plateforme / Console / Type</Text>
              <TextInput
                placeholder="ex. PS5, Switch, PC, Société..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={gamePlatform}
                onChangeText={setGamePlatform}
              />
              <View style={styles.chipsSuggestRow}>
                {Array.from(new Set(['PS5', 'Switch', 'PC', 'Série X', 'Société', 'Mobile', ...gamePlatformHistory])).map((plat) => (
                  <Pressable
                    key={plat}
                    onPress={() => setGamePlatform(plat)}
                    style={styles.suggestChip}
                  >
                    <Text style={styles.suggestChipLabel}>{plat}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Statut d'avancement</Text>
              <View style={styles.optionsGrid}>
                {[
                  { id: 'encours', label: 'En cours' },
                  { id: 'fini', label: 'Fini / Battu' },
                  { id: 'abandon', label: 'Abandonné' },
                  { id: 'aplayer', label: 'À faire' },
                ].map((st) => {
                  const isActive = gameStatus === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      onPress={() => setGameStatus(st.id as GameStatus)}
                      style={[
                        styles.optionButton,
                        isActive && styles.optionButtonActive
                      ]}
                    >
                      <Text style={[styles.optionButtonLabel, isActive && styles.optionButtonLabelActive]}>
                        {st.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Ressenti (Note de 1 à 5)</Text>
              <View style={styles.moodSelectorGrid}>
                {[1, 2, 3, 4, 5].map((val) => {
                  const isActive = gameRating === val;
                  const color = MOOD_COLORS[val as keyof typeof MOOD_COLORS];
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setGameRating(val)}
                      style={[
                        styles.moodButton,
                        isActive && { backgroundColor: color, borderColor: color }
                      ]}
                    >
                      <Text style={[styles.moodButtonLabel, isActive && styles.moodButtonLabelActive]}>
                        ⭐ {val}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Notes de session</Text>
              <TextInput
                multiline
                placeholder="Progression, trophée obtenu, compagnon de jeu, avis ou moments mémorables..."
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                value={gameNotes}
                onChangeText={setGameNotes}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* STEP: LIVRES */}
          {currentStep === 'livres' && (
            <View style={styles.stepSection}>
              <Text style={styles.fieldLabel}>Titre du livre</Text>
              <TextInput
                placeholder="ex. L'Étranger, Sapiens, Dune..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={bookName}
                onChangeText={setBookName}
              />
              {bookHistory.length > 0 && (
                <View style={styles.chipsSuggestRow}>
                  {bookHistory.map((book) => (
                    <Pressable
                      key={book}
                      onPress={() => setBookName(book)}
                      style={styles.suggestChip}
                    >
                      <Text style={styles.suggestChipLabel}>{book}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Auteur</Text>
              <TextInput
                placeholder="ex. Albert Camus, Yuval Noah Harari..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={bookAuthor}
                onChangeText={setBookAuthor}
              />
              {bookAuthorHistory.length > 0 && (
                <View style={styles.chipsSuggestRow}>
                  {bookAuthorHistory.map((author) => (
                    <Pressable
                      key={author}
                      onPress={() => setBookAuthor(author)}
                      style={styles.suggestChip}
                    >
                      <Text style={styles.suggestChipLabel}>{author}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Statut de lecture</Text>
              <View style={styles.optionsGrid}>
                {[
                  { id: 'encours', label: 'En cours' },
                  { id: 'lu', label: 'Lu / Terminé' },
                  { id: 'abandon', label: 'Abandonné' },
                  { id: 'alire', label: 'À lire' },
                ].map((st) => {
                  const isActive = bookStatus === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      onPress={() => setBookStatus(st.id as BookStatus)}
                      style={[
                        styles.optionButton,
                        isActive && styles.optionButtonActive
                      ]}
                    >
                      <Text style={[styles.optionButtonLabel, isActive && styles.optionButtonLabelActive]}>
                        {st.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Ressenti (Note de 1 à 5)</Text>
              <View style={styles.moodSelectorGrid}>
                {[1, 2, 3, 4, 5].map((val) => {
                  const isActive = bookRating === val;
                  const color = MOOD_COLORS[val as keyof typeof MOOD_COLORS];
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setBookRating(val)}
                      style={[
                        styles.moodButton,
                        isActive && { backgroundColor: color, borderColor: color }
                      ]}
                    >
                      <Text style={[styles.moodButtonLabel, isActive && styles.moodButtonLabelActive]}>
                        ⭐ {val}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Citations, pages lues, théories ou avis libre</Text>
              <TextInput
                multiline
                placeholder="Page 120, écriture sublime, avis sur le chapitre..."
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                value={bookNotes}
                onChangeText={setBookNotes}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* STEP: CONCERTS */}
          {currentStep === 'concerts' && (
            <View style={styles.stepSection}>
              <Text style={styles.fieldLabel}>Nom de l'artiste / Concert / Événement</Text>
              <TextInput
                placeholder="ex. Daft Punk, Festival de Jazz, Opéra..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={concertName}
                onChangeText={setConcertName}
              />
              {concertHistory.length > 0 && (
                <View style={styles.chipsSuggestRow}>
                  {concertHistory.map((artist) => (
                    <Pressable
                      key={artist}
                      onPress={() => setConcertName(artist)}
                      style={styles.suggestChip}
                    >
                      <Text style={styles.suggestChipLabel}>{artist}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Lieu / Venue</Text>
              <TextInput
                placeholder="ex. Accor Arena, Olympia, Salle Pleyel..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={concertVenue}
                onChangeText={setConcertVenue}
              />
              {concertVenueHistory.length > 0 && (
                <View style={styles.chipsSuggestRow}>
                  {concertVenueHistory.map((venue) => (
                    <Pressable
                      key={venue}
                      onPress={() => setConcertVenue(venue)}
                      style={styles.suggestChip}
                    >
                      <Text style={styles.suggestChipLabel}>{venue}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Note / Expérience (Note de 1 à 5)</Text>
              <View style={styles.moodSelectorGrid}>
                {[1, 2, 3, 4, 5].map((val) => {
                  const isActive = concertRating === val;
                  const color = MOOD_COLORS[val as keyof typeof MOOD_COLORS];
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setConcertRating(val)}
                      style={[
                        styles.moodButton,
                        isActive && { backgroundColor: color, borderColor: color }
                      ]}
                    >
                      <Text style={[styles.moodButtonLabel, isActive && styles.moodButtonLabelActive]}>
                        ⭐ {val}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Setlist, ambiance, remarques</Text>
              <TextInput
                multiline
                placeholder="Ambiance incroyable, super son, titres préférés joués..."
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                value={concertNotes}
                onChangeText={setConcertNotes}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* STEP: PAYS */}
          {currentStep === 'pays' && (
            <View style={styles.stepSection}>
              <Text style={styles.fieldLabel}>Pays visité</Text>
              <TextInput
                placeholder="ex. Italie, Japon, Canada..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={countryName}
                onChangeText={setCountryName}
              />
              {countryHistory.length > 0 && (
                <View style={styles.chipsSuggestRow}>
                  {countryHistory.map((country) => (
                    <Pressable
                      key={country}
                      onPress={() => setCountryName(country)}
                      style={styles.suggestChip}
                    >
                      <Text style={styles.suggestChipLabel}>{country}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Villes / Lieux remarquables</Text>
              <TextInput
                placeholder="ex. Tokyo, Kyoto, Osaka..."
                placeholderTextColor={colors.muted}
                style={styles.inputField}
                value={countryCity}
                onChangeText={setCountryCity}
              />
              {countryCityHistory.length > 0 && (
                <View style={styles.chipsSuggestRow}>
                  {countryCityHistory.map((city) => (
                    <Pressable
                      key={city}
                      onPress={() => setCountryCity(city)}
                      style={styles.suggestChip}
                    >
                      <Text style={styles.suggestChipLabel}>{city}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Région du monde</Text>
              <View style={styles.optionsGrid}>
                {[
                  { id: 'europe', label: 'Europe' },
                  { id: 'ameriques', label: 'Amériques' },
                  { id: 'asie', label: 'Asie' },
                  { id: 'afrique', label: 'Afrique' },
                  { id: 'oceanie', label: 'Océanie' },
                  { id: 'autre', label: 'Autre' },
                ].map((reg) => {
                  const isActive = countryRegion === reg.id;
                  return (
                    <Pressable
                      key={reg.id}
                      onPress={() => setCountryRegion(reg.id as CountryRegion)}
                      style={[
                        styles.optionButton,
                        isActive && styles.optionButtonActive
                      ]}
                    >
                      <Text style={[styles.optionButtonLabel, isActive && styles.optionButtonLabelActive]}>
                        {reg.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Ressenti global (Note de 1 à 5)</Text>
              <View style={styles.moodSelectorGrid}>
                {[1, 2, 3, 4, 5].map((val) => {
                  const isActive = countryRating === val;
                  const color = MOOD_COLORS[val as keyof typeof MOOD_COLORS];
                  return (
                    <Pressable
                      key={val}
                      onPress={() => setCountryRating(val)}
                      style={[
                        styles.moodButton,
                        isActive && { backgroundColor: color, borderColor: color }
                      ]}
                    >
                      <Text style={[styles.moodButtonLabel, isActive && styles.moodButtonLabelActive]}>
                        ⭐ {val}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Remarques, budget, météo, itinéraire</Text>
              <TextInput
                multiline
                placeholder="Gastronomie folle, gens adorables, itinéraire très dense..."
                placeholderTextColor={colors.muted}
                style={styles.textArea}
                value={countryNotes}
                onChangeText={setCountryNotes}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* STEP: RECAP */}
          {currentStep === 'recap' && (
            <View style={styles.stepSection}>
              <Text style={styles.sectionSubtitle}>
                Récapitulatif des données qui seront sauvegardées pour la journée :
              </Text>

              <View style={styles.recapList}>
                {modulesToTrack.journal ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="book-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Humeur & Journal</Text>
                      <Text style={[styles.recapScoreBadge, { backgroundColor: getMoodColor(journalMood) }]}>
                        Score : {journalMood}/5
                      </Text>
                    </View>
                    <Text numberOfLines={2} style={styles.recapCardBody}>
                      {journalText.trim() ? `« ${journalText.trim()} »` : '(Pas de texte rédigé)'}
                    </Text>
                    {journalTags.trim() ? <Text style={styles.recapCardMeta}>Tags : {journalTags}</Text> : null}
                  </View>
                ) : null}

                {modulesToTrack.sommeil ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="bed-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Sommeil</Text>
                      <Text style={[styles.recapScoreBadge, { backgroundColor: getMoodColor(sleepQuality) }]}>
                        Qualité : {sleepQuality}/5
                      </Text>
                    </View>
                    <Text style={styles.recapCardBody}>
                      Coucher : {sleepBedtime} • Lever : {sleepWakeTime}
                    </Text>
                    {sleepNotes.trim() ? <Text style={styles.recapCardMeta}>{sleepNotes}</Text> : null}
                  </View>
                ) : null}

                {modulesToTrack.activite ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="fitness-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Activité : {activityType}</Text>
                      <Text style={[styles.recapScoreBadge, { backgroundColor: getMoodColor(activityIntensity) }]}>
                        Intensité : {activityIntensity}/5
                      </Text>
                    </View>
                    <Text style={styles.recapCardBody}>
                      Durée : {activityDuration} minutes
                    </Text>
                    {activityNotes.trim() ? <Text style={styles.recapCardMeta}>{activityNotes}</Text> : null}
                  </View>
                ) : null}

                {modulesToTrack.traitements && allTreatments.length > 0 ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="medical-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Traitements</Text>
                    </View>
                    <View style={{ gap: spacing.xs, marginTop: spacing.sm }}>
                      {allTreatments.map((t) => {
                        const taken = !!treatmentsTaken[t.id];
                        return (
                          <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons
                              name={taken ? 'checkmark-circle' : 'close-circle-outline'}
                              size={16}
                              color={taken ? colors.success : colors.muted}
                            />
                            <Text style={[styles.recapCardBody, { marginTop: 0 }, !taken && { color: colors.muted }]}>
                              {t.name} {t.dose ? `(${t.dose})` : ''} — {taken ? 'Pris' : 'Non coché'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {modulesToTrack.substances && preferences.showSensitiveContent && substanceName.trim() ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="cafe-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Substance : {substanceName}</Text>
                      <Text style={[styles.recapScoreBadge, { backgroundColor: getMoodColor(substanceFeel) }]}>
                        Effet : {substanceFeel}/5
                      </Text>
                    </View>
                    <Text style={styles.recapCardBody}>
                      Dose : {substanceDose} {substanceUnit} ({substanceRoute})
                    </Text>
                    {substanceNotes.trim() ? <Text style={styles.recapCardMeta}>{substanceNotes}</Text> : null}
                  </View>
                ) : null}

                {modulesToTrack.jeux && gameName.trim() ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="game-controller-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Jeu : {gameName}</Text>
                      <Text style={[styles.recapScoreBadge, { backgroundColor: getMoodColor(gameRating) }]}>
                        Note : {gameRating}/5
                      </Text>
                    </View>
                    <Text style={styles.recapCardBody}>
                      Plateforme : {gamePlatform || 'Inconnue'} • Statut : {gameStatus === 'fini' ? 'Fini' : gameStatus === 'encours' ? 'En cours' : gameStatus === 'abandon' ? 'Abandonné' : 'À faire'}
                    </Text>
                    {gameNotes.trim() ? <Text style={styles.recapCardMeta}>{gameNotes}</Text> : null}
                  </View>
                ) : null}

                {modulesToTrack.livres && bookName.trim() ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="bookmarks-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Livre : {bookName}</Text>
                      <Text style={[styles.recapScoreBadge, { backgroundColor: getMoodColor(bookRating) }]}>
                        Note : {bookRating}/5
                      </Text>
                    </View>
                    <Text style={styles.recapCardBody}>
                      Auteur : {bookAuthor || 'Inconnu'} • Statut : {bookStatus === 'lu' ? 'Lu' : bookStatus === 'encours' ? 'En cours' : bookStatus === 'abandon' ? 'Abandonné' : 'À lire'}
                    </Text>
                    {bookNotes.trim() ? <Text style={styles.recapCardMeta}>{bookNotes}</Text> : null}
                  </View>
                ) : null}

                {modulesToTrack.concerts && concertName.trim() ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="musical-notes-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Concert : {concertName}</Text>
                      <Text style={[styles.recapScoreBadge, { backgroundColor: getMoodColor(concertRating) }]}>
                        Note : {concertRating}/5
                      </Text>
                    </View>
                    <Text style={styles.recapCardBody}>
                      Lieu : {concertVenue || 'Non spécifié'}
                    </Text>
                    {concertNotes.trim() ? <Text style={styles.recapCardMeta}>{concertNotes}</Text> : null}
                  </View>
                ) : null}

                {modulesToTrack.pays && countryName.trim() ? (
                  <View style={styles.recapCard}>
                    <View style={styles.recapCardHeader}>
                      <Ionicons name="earth-outline" size={18} color={colors.accent} />
                      <Text style={styles.recapCardTitle}>Pays : {countryName}</Text>
                      <Text style={[styles.recapScoreBadge, { backgroundColor: getMoodColor(countryRating) }]}>
                        Note : {countryRating}/5
                      </Text>
                    </View>
                    <Text style={styles.recapCardBody}>
                      Lieux : {countryCity || 'Non spécifiés'} • Région : {countryRegion}
                    </Text>
                    {countryNotes.trim() ? <Text style={styles.recapCardMeta}>{countryNotes}</Text> : null}
                  </View>
                ) : null}
              </View>
            </View>
          )}

        </ScrollView>
      )}

      {/* FOOTER NAVIGATION */}
      {!loading && (
        <View style={styles.footerNav}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${((currentStepIndex + 1) / activeSteps.length) * 100}%` }
              ]}
            />
          </View>

          <View style={styles.buttonRow}>
            {currentStepIndex > 0 ? (
              <Pressable onPress={handlePrev} style={styles.secondaryButton}>
                <Ionicons name="arrow-back" size={20} color={colors.text} />
                <Text style={styles.secondaryButtonLabel}>Précédent</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonLabel}>Annuler</Text>
              </Pressable>
            )}

            {currentStepIndex < activeSteps.length - 1 ? (
              <Pressable onPress={handleNext} style={styles.primaryButton}>
                <Text style={styles.primaryButtonLabel}>Suivant</Text>
                <Ionicons name="arrow-forward" size={20} color={colors.white} />
              </Pressable>
            ) : (
              <Pressable disabled={saving} onPress={handleSaveAll} style={[styles.primaryButton, { backgroundColor: colors.success }]}>
                <Text style={styles.primaryButtonLabel}>
                  {saving ? 'Enregistrement...' : 'Enregistrer le bilan'}
                </Text>
                <Ionicons name="cloud-upload-outline" size={20} color={colors.white} />
              </Pressable>
            )}
          </View>
        </View>
      )}

    </AppShell>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  dateSelectorContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dateHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.chip,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: 6,
  },
  dateHeaderBadgeText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: spacing.md,
  },
  loadingText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  stepContentScroll: {
    flex: 1,
  },
  stepScrollContent: {
    paddingBottom: 40,
  },
  stepSection: {
    gap: spacing.lg,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  selectionGrid: {
    gap: spacing.md,
  },
  selectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  selectionCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  selectionCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCheckboxActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  selectionInfo: {
    flex: 1,
  },
  selectionTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  selectionDesc: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 2,
  },
  fieldLabel: {
    color: colors.accent,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
  },
  subFieldLabel: {
    color: colors.muted,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  inputField: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.text,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  textArea: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderWidth: 1,
    borderRadius: radii.md,
    color: colors.text,
    padding: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    minHeight: 120,
  },
  moodSelectorGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  moodButton: {
    flex: 1,
    minWidth: 60,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodButtonLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  moodButtonLabelActive: {
    color: colors.white,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionButton: {
    width: '48%',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  optionButtonLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  optionButtonLabelActive: {
    color: colors.white,
  },
  timeInputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  chipsSuggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: -spacing.xs,
  },
  suggestChip: {
    backgroundColor: colors.chip,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderColor: colors.line,
    borderWidth: 1,
  },
  suggestChipLabel: {
    color: colors.text,
    fontSize: 12,
    fontFamily: fonts.body,
  },
  treatmentList: {
    gap: spacing.md,
  },
  treatmentCheckCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  treatmentCheckCardActive: {
    borderColor: colors.success,
  },
  treatmentCheckbox: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  treatmentTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  treatmentNameText: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  treatmentDoseText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  recapList: {
    gap: spacing.md,
  },
  recapCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  recapCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.xs,
  },
  recapCardTitle: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    flex: 1,
  },
  recapScoreBadge: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  recapCardBody: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  recapCardMeta: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  footerNav: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  primaryButton: {
    flex: 1.5,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
  successContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  successBadge: {
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderWidth: 1,
    borderRadius: radii.xxl,
    padding: 30,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    width: '100%',
    maxWidth: 320,
  },
  successTitle: {
    color: colors.text,
    fontFamily: fonts.title,
    fontSize: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  successSubtitle: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    textAlign: 'center',
  },
});
