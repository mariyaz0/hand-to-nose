// English (default) and Russian texts. Static text uses data-i18n="key" in index.html;
// dynamic text uses t('key', {var: value}).
// Speed hints use non-breaking spaces (\u00a0) and word joiners (\u2060) so they never wrap.

const STRINGS = {
  en: {
    app_title: 'Which hand?',
    welcome_lead: 'A short study at Bar-Ilan University: how people move a phone to the nose with the right and with the left hand.',
    welcome_what: 'You will hold this phone with an outstretched arm and touch the screen with your nose: 2 practice movements and 12 recorded ones (6 with each hand). It takes about 5–7 minutes.',
    welcome_need: 'You need:',
    need_phone: 'this phone (Android or iPhone)',
    need_sound: 'sound on (iPhone: silent mode off)',
    need_sit: 'to sit upright on a chair',
    btn_start: 'Start',
    not_phone: 'Please open this link on your phone: a computer has no motion sensors.',

    consent_title: 'Consent',
    consent_p1: 'This is a student research project in the lab of Prof. Izhar Bar-Gad (Gonda Brain Research Center, Bar-Ilan University). Researcher: Mariya Zastenskaya.',
    consent_p2: 'During the movements we record the motion sensors of this phone (acceleration and rotation) and the touches on the screen. We also record your answers about age, gender and handedness, and the phone model. We do not record your name, camera, microphone or location.',
    consent_p3: 'The data are anonymous (you get a random code) and are used only for research. You can stop at any moment by closing the page. If you have questions, ask the person who sent you the link.',
    consent_check: 'I have read this and I agree to take part.',
    btn_continue: 'Continue',

    q_title: 'About you',
    q_age: 'Age',
    q_gender: 'Gender',
    gender_male: 'Male',
    gender_female: 'Female',
    q_hand_title: 'Which hand do you use for…',
    ed_writing: 'Writing',
    ed_throwing: 'Throwing',
    ed_toothbrush: 'Toothbrush',
    ed_spoon: 'Spoon',
    ed_m100: 'Always left',
    ed_m50: 'Usually left',
    ed_0: 'Both equally',
    ed_50: 'Usually right',
    ed_100: 'Always right',

    setup_title: 'Sensors and sound',
    setup_text: 'Allow access to the motion sensors and check that you can hear both beeps.',
    btn_sensors: 'Allow motion sensors',
    sensors_wait: 'Checking the sensors…',
    sensors_ok: 'Sensors work ({rate} samples per second) ✓',
    sensors_fail: 'No sensor data. Please use a phone and allow motion access (iPhone: Settings → Apps → Safari → Motion & Orientation Access).',
    sensors_denied: 'Access was denied. Reload the page and tap “Allow”.',
    sound_text: 'Turn the volume up. On iPhone, switch off silent mode.',
    btn_beep_high: '▶ High beep',
    btn_beep_low: '▶ Low beep',

    explain_title: 'How to do the movement',
    step_1: 'Hold the phone upright, lying in your palm, screen facing you. Stretch your arm fully forward so the dot is in front of your nose.',
    step_2: 'Hold still. After a moment you hear a HIGH beep.',
    step_3: 'Bend your elbow and bring the phone to your face at the speed shown on the screen.',
    step_4: 'Touch the dot with the tip of your nose: you hear a LOW beep.',
    step_5: 'Stretch your arm back to the start and hold still. The next movement starts by itself.',
    grip_title: 'Grip',
    grip_text: 'The phone lies in your palm, fingers on its sides, not on the screen.',
    speeds_title: 'Speeds',
    speed_fast: 'Fast',
    speed_normal: 'Normal',
    speed_slow: 'Slow',
    speed_fast_hint: 'under\u00a01\u00a0s',
    speed_normal_hint: 'about\u00a01\u2060–\u20602\u00a0s',
    speed_slow_hint: 'about\u00a03\u2060–\u20604\u00a0s',
    explain_note: 'First 2 practice movements (not recorded), then 12 recorded ones. After you tap “Start practice”, you do not need to tap anything else: just follow the screen and the beeps.',
    btn_replay: 'Replay',
    btn_practice: 'Start practice',
    demo_beep_high: 'HIGH beep',
    demo_beep_low: 'LOW beep',

    hand_right: 'RIGHT HAND',
    hand_left: 'LEFT HAND',
    hand_acc_right: 'RIGHT hand',
    hand_acc_left: 'LEFT hand',
    progress: '{n} of {total}',
    progress_practice: 'Practice {n} of {total}',
    st_extend: 'Stretch your arm and hold still',
    st_pause: 'Wait for the beep…',
    st_go: 'Go!',
    st_back: 'Back to the start and hold still',
    st_recorded: 'Recorded ✓',
    st_practice_ok: 'Good ✓',
    hand_plain_right: 'Right hand',
    hand_plain_left: 'Left hand',
    ov_get_ready: 'Get ready',
    ov_new_speed: 'New speed',
    ov_switch_hand: 'Switch hand',
    ov_error: 'Not counted',
    ov_repeat: 'Let’s repeat this movement.',
    err_false_start_title: 'Too early',
    err_false_start_text: 'You started moving before the high beep. Hold still until you hear it.',
    err_no_touch_title: 'No nose touch',
    err_no_touch_text: 'Your nose did not touch the dot within 10 seconds.',
    err_interrupted_title: 'Interrupted',
    err_interrupted_text: 'The app was in the background.',
    ov_practice_done: 'Practice is over',
    ov_real_start: 'Now the 12 recorded movements begin.',

    rest_title: 'Rest your arm',
    rest_text: 'Put your arm down and rest. Next: take the phone in your {hand}.',

    done_title: 'Thank you!',
    done_text: 'All movements were recorded.',
    done_sending: 'Sending the data… please keep this page open.',
    done_sent: 'All data were sent ✓ You can close the page.',
    done_code: 'Your code: {code}',

    test_title: 'Test: which hand?',
    test_text: 'Hold the phone as in the study: upright in your palm, screen to your face, arm straight, the dot in front of your nose. Use either hand. After the high beep, bring the phone to your nose at your own pace, touch the dot with your nose and return the arm. The app then tells which hand it thinks you used.',
    test_start: 'Start',
    test_progress: 'Test {n}',
    test_any_hand: 'EITHER HAND',
    test_own_pace: 'your own pace',
    test_result_title: 'This was the',
    test_left: 'LEFT HAND',
    test_right: 'RIGHT HAND',
    test_confidence: 'Confidence {p}%',
    test_detail: 'The phone turned {deg}° about its long axis ({dir}).',
    test_dir_left: 'like a left hand',
    test_dir_right: 'like a right hand',
    test_no_move_title: 'Movement not recognised',
    test_no_move: 'The phone hardly moved before the nose touch. Please bring the phone to the nose with the arm.',
    test_again: 'Again',
    test_model: 'Model {v}',
    upload_error: 'Could not send the data yet. Check the internet connection; the app keeps trying.',
  },

  ru: {
    app_title: 'Какой рукой?',
    welcome_lead: 'Небольшое исследование в Университете Бар-Илан: как люди подносят телефон к носу правой и левой рукой.',
    welcome_what: 'Вы будете держать телефон на вытянутой руке и касаться экрана носом: 2 пробных движения и 12 записанных (по 6 каждой рукой). Это займёт около 5–7 минут.',
    welcome_need: 'Понадобится:',
    need_phone: 'этот телефон (Android или iPhone)',
    need_sound: 'включённый звук (на iPhone выключите беззвучный режим)',
    need_sit: 'сидеть прямо на стуле',
    btn_start: 'Начать',
    not_phone: 'Откройте эту ссылку на телефоне: у компьютера нет датчиков движения.',

    consent_title: 'Согласие',
    consent_p1: 'Это студенческий исследовательский проект в лаборатории проф. Изхара Бар-Гада (Центр исследований мозга Гонда, Университет Бар-Илан). Исследователь: Мария Застенская.',
    consent_p2: 'Во время движений записываются датчики движения телефона (ускорение и вращение) и касания экрана. Также сохраняются ваши ответы о возрасте, поле и ведущей руке и модель телефона. Мы не записываем имя, камеру, микрофон и местоположение.',
    consent_p3: 'Данные анонимны (вы получаете случайный код) и используются только для исследования. Вы можете остановиться в любой момент, закрыв страницу. Если есть вопросы, спросите человека, который прислал вам ссылку.',
    consent_check: 'Я прочитал(а) и согласен(на) участвовать.',
    btn_continue: 'Продолжить',

    q_title: 'О вас',
    q_age: 'Возраст',
    q_gender: 'Пол',
    gender_male: 'Мужской',
    gender_female: 'Женский',
    q_hand_title: 'Какой рукой вы…',
    ed_writing: 'Пишете',
    ed_throwing: 'Бросаете',
    ed_toothbrush: 'Чистите зубы',
    ed_spoon: 'Едите ложкой',
    ed_m100: 'Всегда левой',
    ed_m50: 'Обычно левой',
    ed_0: 'Обеими одинаково',
    ed_50: 'Обычно правой',
    ed_100: 'Всегда правой',

    setup_title: 'Датчики и звук',
    setup_text: 'Разрешите доступ к датчикам движения и проверьте, что слышите оба сигнала.',
    btn_sensors: 'Разрешить датчики',
    sensors_wait: 'Проверяю датчики…',
    sensors_ok: 'Датчики работают ({rate} измерений в секунду) ✓',
    sensors_fail: 'Нет данных с датчиков. Используйте телефон и разрешите доступ к движению (iPhone: Настройки → Приложения → Safari → Движение и ориентация).',
    sensors_denied: 'Доступ запрещён. Обновите страницу и нажмите «Разрешить».',
    sound_text: 'Сделайте звук громче. На iPhone выключите беззвучный режим.',
    btn_beep_high: '▶ Высокий сигнал',
    btn_beep_low: '▶ Низкий сигнал',

    explain_title: 'Как делать движение',
    step_1: 'Держите телефон вертикально, он лежит в ладони, экран смотрит на вас. Полностью вытяните руку вперёд, чтобы точка была напротив носа.',
    step_2: 'Замрите. Через пару секунд прозвучит ВЫСОКИЙ сигнал.',
    step_3: 'Согните локоть и поднесите телефон к лицу с той скоростью, которая указана на экране.',
    step_4: 'Коснитесь точки кончиком носа: прозвучит НИЗКИЙ сигнал.',
    step_5: 'Вытяните руку обратно и замрите. Следующее движение начнётся само.',
    grip_title: 'Хват',
    grip_text: 'Телефон лежит в ладони, пальцы на боковых гранях, а не на экране.',
    speeds_title: 'Скорости',
    speed_fast: 'Быстро',
    speed_normal: 'Нормально',
    speed_slow: 'Медленно',
    speed_fast_hint: 'меньше\u00a01\u00a0с',
    speed_normal_hint: 'около\u00a01\u2060–\u20602\u00a0с',
    speed_slow_hint: 'около\u00a03\u2060–\u20604\u00a0с',
    explain_note: 'Сначала 2 пробных движения (не записываются), потом 12 записанных. После кнопки «Начать пробу» больше ничего нажимать не нужно: просто следуйте экрану и сигналам.',
    btn_replay: 'Повторить',
    btn_practice: 'Начать пробу',
    demo_beep_high: 'ВЫСОКИЙ сигнал',
    demo_beep_low: 'НИЗКИЙ сигнал',

    hand_right: 'ПРАВАЯ РУКА',
    hand_left: 'ЛЕВАЯ РУКА',
    hand_acc_right: 'ПРАВУЮ руку',
    hand_acc_left: 'ЛЕВУЮ руку',
    progress: '{n} из {total}',
    progress_practice: 'Проба {n} из {total}',
    st_extend: 'Вытяните руку и замрите',
    st_pause: 'Ждите сигнал…',
    st_go: 'Вперёд!',
    st_back: 'Обратно и замрите',
    st_recorded: 'Записано ✓',
    st_practice_ok: 'Хорошо ✓',
    hand_plain_right: 'Правая рука',
    hand_plain_left: 'Левая рука',
    ov_get_ready: 'Приготовьтесь',
    ov_new_speed: 'Теперь скорость',
    ov_switch_hand: 'Смените руку',
    ov_error: 'Попытка не засчитана',
    ov_repeat: 'Повторим это движение.',
    err_false_start_title: 'Слишком рано',
    err_false_start_text: 'Вы начали двигаться до высокого сигнала. Замрите и ждите, пока не услышите его.',
    err_no_touch_title: 'Нет касания носом',
    err_no_touch_text: 'Нос не коснулся точки за 10 секунд.',
    err_interrupted_title: 'Прервано',
    err_interrupted_text: 'Приложение было свёрнуто.',
    ov_practice_done: 'Проба закончена',
    ov_real_start: 'Начинаются 12 записанных движений.',

    rest_title: 'Отдохните',
    rest_text: 'Опустите руку и отдохните. Дальше: возьмите телефон в {hand}.',

    done_title: 'Спасибо!',
    done_text: 'Все движения записаны.',
    done_sending: 'Отправляю данные… не закрывайте страницу.',
    done_sent: 'Все данные отправлены ✓ Страницу можно закрыть.',
    done_code: 'Ваш код: {code}',

    test_title: 'Тест: какая рука?',
    test_text: 'Держите телефон как в исследовании: вертикально в ладони, экраном к лицу, рука прямая, точка напротив носа. Рука любая. После высокого сигнала поднесите телефон к носу в своём темпе, коснитесь точки носом и верните руку. Затем приложение покажет, какой рукой, по его мнению, было движение.',
    test_start: 'Начать',
    test_progress: 'Тест {n}',
    test_any_hand: 'ЛЮБАЯ РУКА',
    test_own_pace: 'в своём темпе',
    test_result_title: 'Это была',
    test_left: 'ЛЕВАЯ РУКА',
    test_right: 'ПРАВАЯ РУКА',
    test_confidence: 'Уверенность {p}%',
    test_detail: 'Телефон повернулся на {deg}° вокруг своей длинной оси ({dir}).',
    test_dir_left: 'как у левой руки',
    test_dir_right: 'как у правой руки',
    test_no_move_title: 'Движение не распознано',
    test_no_move: 'Телефон почти не двигался до касания носом. Поднесите телефон к носу рукой.',
    test_again: 'Ещё раз',
    test_model: 'Модель {v}',
    upload_error: 'Пока не удалось отправить данные. Проверьте интернет; приложение пробует снова.',
  },
};

let lang = 'en';
const listeners = [];

export function getLang() {
  return lang;
}

export function t(key, vars = {}) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
}

export function setLang(l) {
  lang = l === 'ru' ? 'ru' : 'en';
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  try { localStorage.setItem('htn-lang', lang); } catch { /* storage may be unavailable */ }
  listeners.forEach((f) => f(lang));
}

export function onLangChange(f) {
  listeners.push(f);
}

export function initialLang() {
  try {
    const saved = localStorage.getItem('htn-lang');
    if (saved === 'ru' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return 'en';
}
