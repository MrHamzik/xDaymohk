import type { Locale } from "@/lib/content";
import { crossBorderClause, finalClauses } from "./clauses";

/**
 * Privacy policy.
 *
 * Official text supplied by the rights holder.
 * Russian is the authoritative version; en / zh are translations provided
 * for convenience — see `legal.translationNotice`.
 */

export const privacyBodies: Partial<Record<Locale, React.ReactNode>> = {
  ru: (
    <>
      <h2>1. Общие положения</h2>
                <p>Настоящая политика обработки персональных данных составлена в соответствии с требованиями Федерального закона от 27.07.2006. № 152-ФЗ «О персональных данных» (далее — Закон о персональных данных) и определяет порядок обработки персональных данных и меры по обеспечению безопасности персональных данных, предпринимаемые Байчаевым Хамзатом Рамзановичем (далее — Оператор).</p>
                <p><strong>1.1.</strong> Оператор ставит своей важнейшей целью и условием осуществления своей деятельности соблюдение прав и свобод человека и гражданина при обработке его персональных данных, в том числе защиты прав на неприкосновенность частной жизни, личную и семейную тайну.</p>
                <p><strong>1.2.</strong> Настоящая политика Оператора в отношении обработки персональных данных (далее — Политика) применяется ко всей информации, которую Оператор может получить о посетителях веб-сайта <a href="https://infernal-dash.vercel.app">https://infernal-dash.vercel.app</a>.</p>

                <h2>2. Основные понятия, используемые в Политике</h2>
                <p><strong>2.1. Автоматизированная обработка персональных данных</strong> — обработка персональных данных с помощью средств вычислительной техники.</p>
                <p><strong>2.2. Блокирование персональных данных</strong> — временное прекращение обработки персональных данных (за исключением случаев, если обработка необходима для уточнения персональных данных).</p>
                <p><strong>2.3. Веб-сайт</strong> — совокупность графических и информационных материалов, а также программ для ЭВМ и баз данных, обеспечивающих их доступность в сети интернет по сетевому адресу <a href="https://infernal-dash.vercel.app">https://infernal-dash.vercel.app</a>.</p>
                <p><strong>2.4. Информационная система персональных данных</strong> — совокупность содержащихся в базах данных персональных данных и обеспечивающих их обработку информационных технологий и технических средств.</p>
                <p><strong>2.5. Обезличивание персональных данных</strong> — действия, в результате которых невозможно определить без использования дополнительной информации принадлежность персональных данных конкретному Пользователю или иному субъекту персональных данных.</p>
                <p><strong>2.6. Обработка персональных данных</strong> — любое действие (операция) или совокупность действий (операций), совершаемых с использованием средств автоматизации или без использования таких средств с персональными данными, включая сбор, запись, систематизацию, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передачу (распространение, предоставление, доступ), обезличивание, блокирование, удаление, уничтожение персональных данных.</p>
                <p><strong>2.7. Оператор</strong> — государственный орган, муниципальный орган, юридическое или физическое лицо, самостоятельно или совместно с другими лицами организующие и/или осуществляющие обработку персональных данных, а также определяющие цели обработки персональных данных, состав персональных данных, подлежащих обработке, действия (операции), совершаемые с персональными данными.</p>
                <p><strong>2.8. Персональные данные</strong> — любая информация, относящаяся прямо или косвенно к определенному или определяемому Пользователю веб-сайта <a href="https://infernal-dash.vercel.app">https://infernal-dash.vercel.app</a>.</p>
                <p><strong>2.9. Персональные данные, разрешенные субъектом персональных данных для распространения</strong> — персональные данные, доступ неограниченного круга лиц к которым предоставлен субъектом персональных данных путем дачи согласия на обработку персональных данных, разрешенных субъектом персональных данных для распространения в порядке, предусмотренном Законом о персональных данных (далее — персональные данные, разрешенные для распространения).</p>
                <p><strong>2.10. Пользователь</strong> — любой посетитель веб-сайта <a href="https://infernal-dash.vercel.app">https://infernal-dash.vercel.app</a>.</p>
                <p><strong>2.11. Предоставление персональных данных</strong> — действия, направленные на раскрытие персональных данных определенному лицу или определенному кругу лиц.</p>
                <p><strong>2.12. Распространение персональных данных</strong> — любые действия, направленные на раскрытие персональных данных неопределенному кругу лиц (передача персональных данных) или на ознакомление с персональными данными неограниченного круга лиц, в том числе обнародование персональных данных в средствах массовой информации, размещение в информационно-телекоммуникационных сетях или предоставление доступа к персональным данным каким-либо иным способом.</p>
                <p><strong>2.13. Трансграничная передача персональных данных</strong> — передача персональных данных на территорию иностранного государства органу власти иностранного государства, иностранному физическому или иностранному юридическому лицу.</p>
                <p><strong>2.14. Уничтожение персональных данных</strong> — любые действия, в результате которых персональные данные уничтожаются безвозвратно с невозможностью дальнейшего восстановления содержания персональных данных в информационной системе персональных данных и/или уничтожаются материальные носители персональных данных.</p>

                <h2>3. Основные права и обязанности Оператора</h2>
                <p><strong>3.1.</strong> Оператор имеет право:</p>
                <ul>
                  <li>получать от субъекта персональных данных достоверные информацию и/или документы, содержащие персональные данные;</li>
                  <li>в случае отзыва субъектом персональных данных согласия на обработку персональных данных, а также, направления обращения с требованием о прекращении обработки персональных данных, Оператор вправе продолжить обработку персональных данных без согласия субъекта персональных данных при наличии оснований, указанных в Законе о персональных данных;</li>
                  <li>самостоятельно определять состав и перечень мер, необходимых и достаточных для обеспечения выполнения обязанностей, предусмотренных Законом о персональных данных и принятыми в соответствии с ним нормативными правовыми актами, если иное не предусмотрено Законом о персональных данных или другими федеральными законами.</li>
                </ul>
                <p><strong>3.2.</strong> Оператор обязан:</p>
                <ul>
                  <li>предоставлять субъекту персональных данных по его просьбе информацию, касающуюся обработки его персональных данных;</li>
                  <li>организовывать обработку персональных данных в порядке, установленном действующим законодательством РФ;</li>
                  <li>отвечать на обращения и запросы субъектов персональных данных и их законных представителей в соответствии с требованиями Закона о персональных данных;</li>
                  <li>сообщать в уполномоченный орган по защите прав субъектов персональных данных по запросу этого органа необходимую информацию в течение 10 дней с даты получения такого запроса;</li>
                  <li>публиковать или иным образом обеспечивать неограниченный доступ к настоящей Политике в отношении обработки персональных данных;</li>
                  <li>принимать правовые, организационные и технические меры для защиты персональных данных от неправомерного или случайного доступа к ним, уничтожения, изменения, блокирования, копирования, предоставления, распространения персональных данных, а также от иных неправомерных действий в отношении персональных данных;</li>
                  <li>прекратить передачу (распространение, предоставление, доступ) персональных данных, прекратить обработку и уничтожить персональные данные в порядке и случаях, предусмотренных Законом о персональных данных;</li>
                  <li>исполнять иные обязанности, предусмотренные Законом о персональных данных.</li>
                </ul>

                <h2>4. Основные права и обязанности субъектов персональных данных</h2>
                <p><strong>4.1.</strong> Субъекты персональных данных имеют право:</p>
                <ul>
                  <li>получать информацию, касающуюся обработки его персональных данных, за исключением случаев, предусмотренных федеральными законами. Сведения предоставляются субъекту персональных данных Оператором в доступной форме, и в них не должны содержаться персональные данные, относящиеся к другим субъектам персональных данных, за исключением случаев, когда имеются законные основания для раскрытия таких персональных данных. Перечень информации и порядок ее получения установлен Законом о персональных данных;</li>
                  <li>требовать от оператора уточнения его персональных данных, их блокирования или уничтожения в случае, если персональные данные являются неполными, устаревшими, неточными, незаконно полученными или не являются необходимыми для заявленной цели обработки, а также принимать предусмотренные законом меры по защите своих прав;</li>
                  <li>выдвигать условие предварительного согласия при обработке персональных данных в целях продвижения на рынке товаров, работ и услуг;</li>
                  <li>на отзыв согласия на обработку персональных данных, а также, на направление требования о прекращении обработки персональных данных;</li>
                  <li>обжаловать в уполномоченный орган по защите прав субъектов персональных данных или в судебном порядке неправомерные действия или бездействие Оператора при обработке его персональных данных;</li>
                  <li>на осуществление иных прав, предусмотренных законодательством РФ.</li>
                </ul>
                <p><strong>4.2.</strong> Субъекты персональных данных обязаны:</p>
                <ul>
                  <li>предоставлять Оператору достоверные данные о себе;</li>
                  <li>сообщать Оператору об уточнении (обновлении, изменении) своих персональных данных.</li>
                </ul>
                <p><strong>4.3.</strong> Лица, передавшие Оператору недостоверные сведения о себе, либо сведения о другом субъекте персональных данных без согласия последнего, несут ответственность в соответствии с законодательством РФ.</p>

                <h2>5. Принципы обработки персональных данных</h2>
                <p><strong>5.1.</strong> Обработка персональных данных осуществляется на законной и справедливой основе.</p>
                <p><strong>5.2.</strong> Обработка персональных данных ограничивается достижением конкретных, заранее определенных и законных целей. Не допускается обработка персональных данных, несовместимая с целями сбора персональных данных.</p>
                <p><strong>5.3.</strong> Не допускается объединение баз данных, содержащих персональные данные, обработка которых осуществляется в целях, несовместимых между собой.</p>
                <p><strong>5.4.</strong> Обработке подлежат только персональные данные, которые отвечают целям их обработки.</p>
                <p><strong>5.5.</strong> Содержание и объем обрабатываемых персональных данных соответствуют заявленным целям обработки. Не допускается избыточность обрабатываемых персональных данных по отношению к заявленным целям их обработки.</p>
                <p><strong>5.6.</strong> При обработке персональных данных обеспечивается точность персональных данных, их достаточность, а в необходимых случаях и актуальность по отношению к целям обработки персональных данных. Оператор принимает необходимые меры и/или обеспечивает их принятие по удалению или уточнению неполных или неточных данных.</p>
                <p><strong>5.7.</strong> Хранение персональных данных осуществляется в форме, позволяющей определить субъекта персональных данных, не дольше, чем этого требуют цели обработки персональных данных, если срок хранения персональных данных не установлен федеральным законом, договором, стороной которого, выгодоприобретателем или поручителем по которому является субъект персональных данных. Обрабатываемые персональные данные уничтожаются либо обезличиваются по достижении целей обработки или в случае утраты необходимости в достижении этих целей, если иное не предусмотрено федеральным законом.</p>

                <h2>6. Цели обработки персональных данных</h2>
                <table>
                  <thead>
                    <tr>
                      <th>Цель обработки</th>
                      <th>Персональные данные</th>
                      <th>Правовые основания</th>
                      <th>Виды обработки персональных данных</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>предоставление доступа Пользователю к сервисам, информации и/или материалам, содержащимся на веб-сайте</td>
                      <td>электронныйадрес, фотографии</td>
                      <td>договоры, заключаемые между оператором и субъектом персональных данных, Обработка персональных данных, разрешенных субъектом для распространения</td>
                      <td>Сбор, запись, систематизация, накопление, хранение, уничтожение и обезличивание персональных данных, Отправка информационных писем на адрес электронной почты, Передача персональных данных</td>
                    </tr>
                  </tbody>
                </table>

                <h2>7. Условия обработки персональных данных</h2>
                <p><strong>7.1.</strong> Обработка персональных данных осуществляется с согласия субъекта персональных данных на обработку его персональных данных.</p>
                <p><strong>7.2.</strong> Обработка персональных данных необходима для достижения целей, предусмотренных международным договором Российской Федерации или законом, для осуществления возложенных законодательством Российской Федерации на оператора функций, полномочий и обязанностей.</p>
                <p><strong>7.3.</strong> Обработка персональных данных необходима для осуществления правосудия, исполнения судебного акта, акта другого органа или должностного лица, подлежащих исполнению в соответствии с законодательством Российской Федерации об исполнительном производстве.</p>
                <p><strong>7.4.</strong> Обработка персональных данных необходима для исполнения договора, стороной которого либо выгодоприобретателем или поручителем по которому является субъект персональных данных, а также для заключения договора по инициативе субъекта персональных данных или договора, по которому субъект персональных данных будет являться выгодоприобретателем или поручителем.</p>
                <p><strong>7.5.</strong> Обработка персональных данных необходима для осуществления прав и законных интересов оператора или третьих лиц либо для достижения общественно значимых целей при условии, что при этом не нарушаются права и свободы субъекта персональных данных.</p>
                <p><strong>7.6.</strong> Осуществляется обработка персональных данных, доступ неограниченного круга лиц к которым предоставлен субъектом персональных данных либо по его просьбе (далее — общедоступные персональные данные).</p>
                <p><strong>7.7.</strong> Осуществляется обработка персональных данных, подлежащих опубликованию или обязательному раскрытию в соответствии с федеральным законом.</p>

                <h2>8. Порядок сбора, хранения, передачи и других видов обработки персональных данных</h2>
                <p>Безопасность персональных данных, которые обрабатываются Оператором, обеспечивается путем реализации правовых, организационных и технических мер, необходимых для выполнения в полном объеме требований действующего законодательства в области защиты персональных данных.</p>
                <p><strong>8.1.</strong> Оператор обеспечивает сохранность персональных данных и принимает все возможные меры, исключающие доступ к персональным данным неуполномоченных лиц.</p>
                <p><strong>8.2.</strong> Персональные данные Пользователя не передаются третьим лицам, за исключением случаев, связанных с исполнением действующего законодательства, случаев, когда субъектом персональных данных дано согласие Оператору на передачу данных третьему лицу для исполнения обязательств по гражданско-правовому договору, а также передачи обезличенных технических сведений поставщикам инфраструктуры и измерения в объёме, указанном в пунктах 8.5 и 8.10 настоящей Политики.</p>
                <p><strong>8.3.</strong> В случае выявления неточностей в персональных данных, Пользователь может актуализировать их самостоятельно, путем направления Оператору уведомление на адрес электронной почты Оператора <a href="mailto:support@infernal-dash.xyz">support@infernal-dash.xyz</a> с пометкой «Актуализация персональных данных».</p>
                <p><strong>8.4.</strong> Срок обработки персональных данных определяется достижением целей, для которых были собраны персональные данные, если иной срок не предусмотрен договором или действующим законодательством. Пользователь может в любой момент отозвать свое согласие на обработку персональных данных, направив Оператору уведомление посредством электронной почты на электронный адрес Оператора <a href="mailto:support@infernal-dash.xyz">support@infernal-dash.xyz</a> с пометкой «Отзыв согласия на обработку персональных данных».</p>
                <p><strong>8.5.</strong> Вся информация, которая собирается сторонними сервисами, в том числе платежными системами, средствами связи и другими поставщиками услуг, хранится и обрабатывается указанными лицами (Операторами) в соответствии с их Пользовательским соглашением и Политикой конфиденциальности. Субъект персональных данных и/или с указанными документами. Оператор не несет ответственность за действия третьих лиц, в том числе указанных в настоящем пункте поставщиков услуг.</p>
                <p><strong>8.6.</strong> Установленные субъектом персональных данных запреты на передачу (кроме предоставления доступа), а также на обработку или условия обработки (кроме получения доступа) персональных данных, разрешенных для распространения, не действуют в случаях обработки персональных данных в государственных, общественных и иных публичных интересах, определенных законодательством РФ.</p>
                <p><strong>8.7.</strong> Оператор при обработке персональных данных обеспечивает конфиденциальность персональных данных.</p>
                <p><strong>8.8.</strong> Оператор осуществляет хранение персональных данных в форме, позволяющей определить субъекта персональных данных, не дольше, чем этого требуют цели обработки персональных данных, если срок хранения персональных данных не установлен федеральным законом, договором, стороной которого, выгодоприобретателем или поручителем по которому является субъект персональных данных.</p>
                <p><strong>8.9.</strong> Условием прекращения обработки персональных данных может являться достижение целей обработки персональных данных, истечение срока действия согласия субъекта персональных данных, отзыв согласия субъектом персональных данных или требование о прекращении обработки персональных данных, а также выявление неправомерной обработки персональных данных.</p>
                <p><strong>8.10.</strong> Сайт использует сервисы <strong>Vercel Web Analytics</strong> и <strong>Vercel Speed Insights</strong> (Vercel Inc., США) для подсчёта посещений и измерения скорости загрузки страниц. Указанные сервисы <strong>не используют файлы cookie</strong> и не присваивают посетителю идентификатор, позволяющий отслеживать его между сайтами или сеансами. Обрабатываются обезличенные технические сведения: адрес страницы, источник перехода, тип устройства и браузера, страна, а также показатели производительности (время отрисовки, отзывчивость, стабильность вёрстки). Эти сведения не позволяют определить конкретного Пользователя и не объединяются с данными учётной записи. Правовое основание — законный интерес Оператора в обеспечении работоспособности и производительности Сайта. Условия обработки на стороне Vercel Inc. определяются политикой указанного лица; на такую передачу распространяется оговорка пункта 8.5 настоящей Политики.</p>

                <h2>9. Перечень действий, производимых Оператором с полученными персональными данными</h2>
                <p><strong>9.1.</strong> Оператор осуществляет сбор, запись, систематизацию, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передачу (распространение, предоставление, доступ), обезличивание, блокирование, удаление и уничтожение персональных данных.</p>
                <p><strong>9.2.</strong> Оператор осуществляет автоматизированную обработку персональных данных с получением и/или передачей полученной информации по информационно-телекоммуникационным сетям или без таковой.</p>

                <h2>10. Трансграничная передача персональных данных</h2>
                <p><strong>10.1.</strong> Оператор до начала осуществления деятельности по трансграничной передаче персональных данных обязан уведомить уполномоченный орган по защите прав субъектов персональных данных о своем намерении осуществлять трансграничную передачу персональных данных (такое уведомление направляется отдельно от уведомления о намерении осуществлять обработку персональных данных).</p>
                <p><strong>10.2.</strong> Оператор до подачи вышеуказанного уведомления, обязан получить от органов власти иностранного государства, иностранных физических лиц, иностранных юридических лиц, которым планируется трансграничная передача персональных данных, соответствующие сведения.</p>
      {crossBorderClause.ru}

                <h2>11. Конфиденциальность персональных данных</h2>
                <p>Оператор и иные лица, получившие доступ к персональным данным, обязаны не раскрывать третьим лицам и не распространять персональные данные без согласия субъекта персональных данных, если иное не предусмотрено федеральным законом.</p>

                <h2>12. Заключительные положения</h2>
                <p><strong>12.1.</strong> Пользователь может получить любые разъяснения по интересующим вопросам, касающимся обработки его персональных данных, обратившись к Оператору с помощью электронной почты <a href="mailto:support@infernal-dash.xyz">support@infernal-dash.xyz</a>.</p>
                <p><strong>12.2.</strong> В данном документе будут отражены любые изменения политики обработки персональных данных Оператором. Политика действует бессрочно до замены ее новой версией.</p>
                <p><strong>12.3.</strong> Актуальная версия Политики в свободном доступе расположена в сети Интернет по адресу <a href="https://infernal-dash.vercel.app/privacy-policy.html">https://infernal-dash.vercel.app/privacy-policy.html</a>.</p>

      {finalClauses.ru}
    </>
  ),

  en: (
    <>
      <h2>1. General provisions</h2>
      <p>This personal data processing policy has been drawn up in accordance with the requirements of Federal Law No. 152-FZ of 27.07.2006 “On Personal Data” (hereinafter — the Personal Data Law) and determines the procedure for processing personal data and the measures to ensure the security of personal data taken by Baychaev Khamzat Ramzanovich (hereinafter — the Operator).</p>
      <p>1.1. The Operator sets as the most important goal and condition of carrying out its activities the observance of human and civil rights and freedoms when processing personal data, including the protection of the rights to inviolability of private life and to personal and family secrets.</p>
      <p>1.2. This Operator’s policy regarding the processing of personal data (hereinafter — the Policy) applies to all information that the Operator may obtain about visitors to the website https://infernal-dash.vercel.app.</p>

      <h2>2. Key terms used in the Policy</h2>
      <p>2.1. Automated processing of personal data — processing of personal data by means of computing technology.</p>
      <p>2.2. Blocking of personal data — temporary cessation of the processing of personal data (except where processing is necessary to clarify personal data).</p>
      <p>2.3. Website — a set of graphical and informational materials, as well as computer programs and databases, ensuring their availability on the Internet at the network address https://infernal-dash.vercel.app.</p>
      <p>2.4. Personal data information system — a set of personal data contained in databases together with the information technologies and technical means ensuring their processing.</p>
      <p>2.5. Anonymisation of personal data — actions as a result of which it is impossible, without the use of additional information, to determine that personal data belong to a particular User or other personal data subject.</p>
      <p>2.6. Processing of personal data — any action (operation) or set of actions (operations) performed with or without the use of automation tools with personal data, including collection, recording, systematisation, accumulation, storage, clarification (updating, modification), extraction, use, transfer (distribution, provision, access), anonymisation, blocking, deletion and destruction of personal data.</p>
      <p>2.7. Operator — a state body, municipal body, legal entity or individual that independently or jointly with other persons organises and/or carries out the processing of personal data, and also determines the purposes of processing personal data, the composition of the personal data to be processed, and the actions (operations) performed with personal data.</p>
      <p>2.8. Personal data — any information relating directly or indirectly to a determined or determinable User of the website https://infernal-dash.vercel.app.</p>
      <p>2.9. Personal data permitted by the personal data subject for distribution — personal data to which access by an unlimited range of persons has been granted by the personal data subject by giving consent to the processing of personal data permitted by the personal data subject for distribution in the manner provided for by the Personal Data Law (hereinafter — personal data permitted for distribution).</p>
      <p>2.10. User — any visitor to the website https://infernal-dash.vercel.app.</p>
      <p>2.11. Provision of personal data — actions aimed at disclosing personal data to a particular person or a particular range of persons.</p>
      <p>2.12. Distribution of personal data — any actions aimed at disclosing personal data to an indefinite range of persons (transfer of personal data) or at acquainting an unlimited range of persons with personal data, including publication of personal data in mass media, placement in information and telecommunication networks, or granting access to personal data by any other means.</p>
      <p>2.13. Cross-border transfer of personal data — transfer of personal data to the territory of a foreign state to a foreign state authority, a foreign individual or a foreign legal entity.</p>
      <p>2.14. Destruction of personal data — any actions as a result of which personal data are irretrievably destroyed with the impossibility of further restoration of the content of the personal data in the personal data information system and/or the material carriers of personal data are destroyed.</p>

      <h2>3. Principal rights and obligations of the Operator</h2>
      <p>3.1. The Operator has the right to:</p>
      <ul>
        <li>receive from the personal data subject accurate information and/or documents containing personal data;</li>
        <li>where the personal data subject withdraws consent to the processing of personal data, and also where a request to cease the processing of personal data is sent, continue processing personal data without the consent of the personal data subject if the grounds specified in the Personal Data Law are present;</li>
        <li>independently determine the composition and list of measures necessary and sufficient to ensure the fulfilment of the obligations provided for by the Personal Data Law and the regulatory legal acts adopted in accordance with it, unless otherwise provided by the Personal Data Law or other federal laws.</li>
      </ul>
      <p>3.2. The Operator is obliged to:</p>
      <ul>
        <li>provide the personal data subject, at their request, with information concerning the processing of their personal data;</li>
        <li>organise the processing of personal data in the manner established by the current legislation of the Russian Federation;</li>
        <li>respond to appeals and requests from personal data subjects and their legal representatives in accordance with the requirements of the Personal Data Law;</li>
        <li>report to the authorised body for the protection of the rights of personal data subjects, at that body’s request, the necessary information within 10 days from the date of receipt of such a request;</li>
        <li>publish or otherwise ensure unrestricted access to this Policy regarding the processing of personal data;</li>
        <li>take legal, organisational and technical measures to protect personal data against unlawful or accidental access, destruction, modification, blocking, copying, provision and distribution of personal data, as well as against other unlawful actions in relation to personal data;</li>
        <li>cease the transfer (distribution, provision, access) of personal data, cease processing and destroy personal data in the manner and in the cases provided for by the Personal Data Law;</li>
        <li>perform other obligations provided for by the Personal Data Law.</li>
      </ul>

      <h2>4. Principal rights and obligations of personal data subjects</h2>
      <p>4.1. Personal data subjects have the right to:</p>
      <ul>
        <li>receive information concerning the processing of their personal data, except in the cases provided for by federal laws. The information is provided to the personal data subject by the Operator in an accessible form and must not contain personal data relating to other personal data subjects, except where there are lawful grounds for disclosing such personal data. The list of information and the procedure for obtaining it are established by the Personal Data Law;</li>
        <li>require the operator to clarify their personal data, block or destroy it if the personal data are incomplete, outdated, inaccurate, unlawfully obtained or not necessary for the stated purpose of processing, and also to take the measures provided for by law to protect their rights;</li>
        <li>put forward a condition of prior consent when personal data are processed for the purposes of promoting goods, works and services on the market;</li>
        <li>withdraw consent to the processing of personal data, and also to send a request to cease the processing of personal data;</li>
        <li>appeal to the authorised body for the protection of the rights of personal data subjects, or in court, against unlawful actions or inaction of the Operator in processing their personal data;</li>
        <li>exercise other rights provided for by the legislation of the Russian Federation.</li>
      </ul>
      <p>4.2. Personal data subjects are obliged to:</p>
      <ul>
        <li>provide the Operator with accurate information about themselves;</li>
        <li>inform the Operator of the clarification (updating, modification) of their personal data.</li>
      </ul>
      <p>4.3. Persons who have provided the Operator with inaccurate information about themselves, or information about another personal data subject without the latter’s consent, bear liability in accordance with the legislation of the Russian Federation.</p>

      <h2>5. Principles of personal data processing</h2>
      <p>5.1. The processing of personal data is carried out on a lawful and fair basis.</p>
      <p>5.2. The processing of personal data is limited to the achievement of specific, predetermined and lawful purposes. Processing of personal data incompatible with the purposes of collecting personal data is not permitted.</p>
      <p>5.3. It is not permitted to merge databases containing personal data whose processing is carried out for purposes incompatible with each other.</p>
      <p>5.4. Only personal data that meet the purposes of their processing are subject to processing.</p>
      <p>5.5. The content and volume of the personal data processed correspond to the stated purposes of processing. Redundancy of the personal data processed in relation to the stated purposes of their processing is not permitted.</p>
      <p>5.6. When processing personal data, the accuracy of the personal data, their sufficiency and, where necessary, their relevance to the purposes of processing personal data are ensured. The Operator takes the necessary measures and/or ensures that they are taken to delete or clarify incomplete or inaccurate data.</p>
      <p>5.7. Personal data are stored in a form that permits identification of the personal data subject for no longer than required by the purposes of processing personal data, unless the storage period for personal data is established by federal law or by a contract to which the personal data subject is a party, beneficiary or guarantor. The personal data processed are destroyed or anonymised upon achievement of the purposes of processing, or in the event that the need to achieve those purposes is lost, unless otherwise provided by federal law.</p>

      <h2>6. Purposes of personal data processing</h2>
      <table>
        <thead>
          <tr>
            <th>Purpose of processing</th>
            <th>Personal data</th>
            <th>Legal grounds</th>
            <th>Types of personal data processing</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>providing the User with access to the services, information and/or materials contained on the website</td>
            <td>email address, photographs</td>
            <td>contracts concluded between the operator and the personal data subject; processing of personal data permitted by the subject for distribution</td>
            <td>Collection, recording, systematisation, accumulation, storage, destruction and anonymisation of personal data; sending informational letters to the email address; transfer of personal data</td>
          </tr>
        </tbody>
      </table>

      <h2>7. Conditions for personal data processing</h2>
      <p>7.1. The processing of personal data is carried out with the consent of the personal data subject to the processing of their personal data.</p>
      <p>7.2. The processing of personal data is necessary to achieve the purposes provided for by an international treaty of the Russian Federation or by law, and for the exercise of the functions, powers and duties conferred on the operator by the legislation of the Russian Federation.</p>
      <p>7.3. The processing of personal data is necessary for the administration of justice, the execution of a judicial act, or an act of another body or official subject to execution in accordance with the legislation of the Russian Federation on enforcement proceedings.</p>
      <p>7.4. The processing of personal data is necessary for the performance of a contract to which the personal data subject is a party, beneficiary or guarantor, and also for the conclusion of a contract at the initiative of the personal data subject or a contract under which the personal data subject will be the beneficiary or guarantor.</p>
      <p>7.5. The processing of personal data is necessary for the exercise of the rights and legitimate interests of the operator or third parties, or for the achievement of socially significant purposes, provided that the rights and freedoms of the personal data subject are not violated.</p>
      <p>7.6. Processing is carried out of personal data to which access by an unlimited range of persons has been granted by the personal data subject or at their request (hereinafter — publicly available personal data).</p>
      <p>7.7. Processing is carried out of personal data subject to publication or mandatory disclosure in accordance with federal law.</p>

      <h2>8. Procedure for the collection, storage, transfer and other types of personal data processing</h2>
      <p>The security of the personal data processed by the Operator is ensured through the implementation of legal, organisational and technical measures necessary for full compliance with the requirements of the current legislation in the field of personal data protection.</p>
      <p>8.1. The Operator ensures the safekeeping of personal data and takes all possible measures to preclude access to personal data by unauthorised persons.</p>
      <p>8.2. The User’s personal data is not transferred to third parties, except where required by applicable law, where the personal data subject has consented to the transfer for the performance of a civil-law contract, and for the transfer of anonymous technical information to infrastructure and measurement providers to the extent set out in clauses 8.5 and 8.10 of this Policy.</p>
      <p>8.3. If inaccuracies in personal data are identified, the User may update them independently by sending the Operator a notification to the Operator’s email address support@infernal-dash.xyz marked “Updating of personal data”.</p>
      <p>8.4. The period of personal data processing is determined by the achievement of the purposes for which the personal data were collected, unless a different period is provided for by contract or by the current legislation. The User may at any time withdraw their consent to the processing of personal data by sending the Operator a notification by email to the Operator’s email address support@infernal-dash.xyz marked “Withdrawal of consent to the processing of personal data”.</p>
      <p>8.5. All information collected by third-party services, including payment systems, means of communication and other service providers, is stored and processed by the said persons (Operators) in accordance with their User Agreement and Privacy Policy. The Operator is not liable for the actions of third parties, including the service providers referred to in this clause.</p>
      <p>8.6. Prohibitions established by the personal data subject on the transfer (other than granting access), as well as on the processing or conditions of processing (other than obtaining access) of personal data permitted for distribution, do not apply in cases of processing personal data in state, public and other public interests determined by the legislation of the Russian Federation.</p>
      <p>8.7. When processing personal data, the Operator ensures the confidentiality of personal data.</p>
      <p>8.8. The Operator stores personal data in a form that permits identification of the personal data subject for no longer than required by the purposes of processing personal data, unless the storage period for personal data is established by federal law or by a contract to which the personal data subject is a party, beneficiary or guarantor.</p>
      <p>8.9. Grounds for ceasing the processing of personal data may include the achievement of the purposes of processing personal data, the expiry of the consent of the personal data subject, the withdrawal of consent by the personal data subject or a request to cease the processing of personal data, as well as the identification of unlawful processing of personal data.</p>
      <p>8.10. The Site uses <strong>Vercel Web Analytics</strong> and <strong>Vercel Speed Insights</strong> (Vercel Inc., USA) to count visits and measure page loading speed. These services <strong>do not use cookies</strong> and do not assign the visitor an identifier that would allow tracking across sites or sessions. The information processed is anonymous and technical: the page address, the referring source, the device and browser type, the country, and performance measurements (rendering time, responsiveness, layout stability). It does not identify an individual User and is not combined with account data. The legal basis is the Operator’s legitimate interest in keeping the Site available and fast. Processing on the side of Vercel Inc. is governed by that party’s own policy; clause 8.5 of this Policy applies to such transfer.</p>

      <h2>9. List of actions performed by the Operator with the personal data obtained</h2>
      <p>9.1. The Operator carries out the collection, recording, systematisation, accumulation, storage, clarification (updating, modification), extraction, use, transfer (distribution, provision, access), anonymisation, blocking, deletion and destruction of personal data.</p>
      <p>9.2. The Operator carries out automated processing of personal data with or without the receipt and/or transfer of the information obtained via information and telecommunication networks.</p>

      <h2>10. Cross-border transfer of personal data</h2>
      <p>10.1. Before commencing activities involving the cross-border transfer of personal data, the Operator is obliged to notify the authorised body for the protection of the rights of personal data subjects of its intention to carry out cross-border transfer of personal data (such notification is sent separately from the notification of the intention to process personal data).</p>
      <p>10.2. Before submitting the above notification, the Operator is obliged to obtain the relevant information from the authorities of the foreign state, the foreign individuals and the foreign legal entities to which the cross-border transfer of personal data is planned.</p>
      {crossBorderClause.en}

      <h2>11. Confidentiality of personal data</h2>
      <p>The Operator and other persons who have obtained access to personal data are obliged not to disclose to third parties and not to distribute personal data without the consent of the personal data subject, unless otherwise provided by federal law.</p>

      <h2>12. Final provisions</h2>
      <p>12.1. The User may obtain any clarification on questions of interest concerning the processing of their personal data by contacting the Operator by email at support@infernal-dash.xyz.</p>
      <p>12.2. Any changes to the Operator’s personal data processing policy will be reflected in this document. The Policy is valid indefinitely until replaced by a new version.</p>
      <p>12.3. The current version of the Policy is freely available on the Internet at https://infernal-dash.vercel.app/privacy.</p>
      {finalClauses.en}
    </>
  ),

  zh: (
    <>
      <h2>1. 一般规定</h2>
      <p>本个人数据处理政策依据 2006 年 7 月 27 日第 152-FZ 号联邦法律《关于个人数据》（下称《个人数据法》）的要求制定，规定了拜恰耶夫·哈姆扎特·拉姆扎诺维奇（下称运营者）处理个人数据的程序以及为保障个人数据安全所采取的措施。</p>
      <p>1.1. 运营者将在处理个人数据时遵守人与公民的权利和自由，包括保护私生活不受侵犯的权利、个人秘密与家庭秘密的权利，作为其开展活动的首要目标与条件。</p>
      <p>1.2. 本运营者关于个人数据处理的政策（下称本政策）适用于运营者可能获得的、关于网站 https://infernal-dash.vercel.app 访问者的全部信息。</p>

      <h2>2. 本政策使用的基本概念</h2>
      <p>2.1. 个人数据自动化处理 — 借助计算技术手段对个人数据进行的处理。</p>
      <p>2.2. 个人数据封锁 — 暂时停止个人数据处理（为澄清个人数据而必需的处理除外）。</p>
      <p>2.3. 网站 — 图形与信息材料，以及保障其在互联网地址 https://infernal-dash.vercel.app 可访问的计算机程序与数据库的总和。</p>
      <p>2.4. 个人数据信息系统 — 数据库中所含个人数据，以及保障其处理的信息技术与技术手段的总和。</p>
      <p>2.5. 个人数据去标识化 — 使得在不使用附加信息的情况下无法确定个人数据归属于特定用户或其他个人数据主体的行为。</p>
      <p>2.6. 个人数据处理 — 使用或不使用自动化工具对个人数据实施的任何行为（操作）或行为（操作）的总和，包括收集、记录、系统化、积累、存储、澄清（更新、修改）、提取、使用、传输（传播、提供、访问）、去标识化、封锁、删除、销毁个人数据。</p>
      <p>2.7. 运营者 — 独立或与他人共同组织及／或实施个人数据处理，并确定个人数据处理目的、应处理个人数据的构成、对个人数据实施的行为（操作）的国家机关、市政机关、法人或自然人。</p>
      <p>2.8. 个人数据 — 直接或间接与网站 https://infernal-dash.vercel.app 的特定或可识别用户相关的任何信息。</p>
      <p>2.9. 个人数据主体许可传播的个人数据 — 个人数据主体按《个人数据法》规定的程序，通过对许可传播的个人数据处理作出同意，从而向不特定范围的人提供访问权限的个人数据（下称许可传播的个人数据）。</p>
      <p>2.10. 用户 — 网站 https://infernal-dash.vercel.app 的任何访问者。</p>
      <p>2.11. 个人数据的提供 — 旨在向特定人或特定范围的人披露个人数据的行为。</p>
      <p>2.12. 个人数据的传播 — 旨在向不特定范围的人披露个人数据（个人数据的传递），或使不特定范围的人知悉个人数据的任何行为，包括在大众媒体上公开个人数据、在信息电信网络中发布，或以任何其他方式提供对个人数据的访问。</p>
      <p>2.13. 个人数据的跨境传输 — 将个人数据传输至外国境内的外国国家机关、外国自然人或外国法人。</p>
      <p>2.14. 个人数据的销毁 — 导致个人数据被不可逆地销毁、无法在个人数据信息系统中进一步恢复其内容，及／或个人数据的物理载体被销毁的任何行为。</p>

      <h2>3. 运营者的主要权利与义务</h2>
      <p>3.1. 运营者有权：</p>
      <ul>
        <li>从个人数据主体处获取真实的信息及／或含有个人数据的文件；</li>
        <li>在个人数据主体撤回个人数据处理同意，以及提出停止处理个人数据的请求时，若存在《个人数据法》所列依据，运营者有权在无个人数据主体同意的情况下继续处理个人数据；</li>
        <li>自行确定为全面履行《个人数据法》及据此通过的规范性法律文件所规定义务而必需且充分的措施构成与清单，但《个人数据法》或其他联邦法律另有规定的除外。</li>
      </ul>
      <p>3.2. 运营者有义务：</p>
      <ul>
        <li>应个人数据主体的请求，向其提供有关处理其个人数据的信息；</li>
        <li>按照俄罗斯联邦现行法律规定的程序组织个人数据处理；</li>
        <li>依据《个人数据法》的要求，答复个人数据主体及其法定代理人的申诉与请求；</li>
        <li>应个人数据主体权利保护主管机关的要求，自收到该请求之日起 10 日内向其报告必要信息；</li>
        <li>公布或以其他方式保障对本个人数据处理政策的不受限制的访问；</li>
        <li>采取法律、组织与技术措施，保护个人数据免遭非法或意外的访问、销毁、修改、封锁、复制、提供、传播，以及针对个人数据的其他非法行为；</li>
        <li>按《个人数据法》规定的程序与情形，停止个人数据的传输（传播、提供、访问），停止处理并销毁个人数据；</li>
        <li>履行《个人数据法》规定的其他义务。</li>
      </ul>

      <h2>4. 个人数据主体的主要权利与义务</h2>
      <p>4.1. 个人数据主体有权：</p>
      <ul>
        <li>获取有关处理其个人数据的信息，联邦法律规定的情形除外。该等信息由运营者以易于理解的形式提供给个人数据主体，且不得含有涉及其他个人数据主体的个人数据，但存在披露该等个人数据的合法依据的除外。信息清单与获取程序由《个人数据法》规定；</li>
        <li>在个人数据不完整、过时、不准确、非法取得或对于所声明的处理目的并非必需时，要求运营者澄清、封锁或销毁其个人数据，并采取法律规定的措施保护自身权利；</li>
        <li>对于以在市场上推广商品、工程和服务为目的的个人数据处理，提出事先同意的条件；</li>
        <li>撤回个人数据处理同意，以及提出停止处理个人数据的要求；</li>
        <li>就运营者在处理其个人数据时的非法作为或不作为，向个人数据主体权利保护主管机关申诉或提起诉讼；</li>
        <li>行使俄罗斯联邦法律规定的其他权利。</li>
      </ul>
      <p>4.2. 个人数据主体有义务：</p>
      <ul>
        <li>向运营者提供关于自身的真实数据；</li>
        <li>就其个人数据的澄清（更新、修改）通知运营者。</li>
      </ul>
      <p>4.3. 向运营者提供关于自身的不实信息，或未经他人同意提供其他个人数据主体信息的人，依据俄罗斯联邦法律承担责任。</p>

      <h2>5. 个人数据处理原则</h2>
      <p>5.1. 个人数据处理在合法与公正的基础上进行。</p>
      <p>5.2. 个人数据处理以实现具体、事先确定且合法的目的为限。不允许进行与个人数据收集目的不相符的个人数据处理。</p>
      <p>5.3. 不允许合并包含个人数据的数据库，如该等数据的处理目的彼此不相容。</p>
      <p>5.4. 仅对符合其处理目的的个人数据进行处理。</p>
      <p>5.5. 所处理个人数据的内容与数量应与所声明的处理目的相符。不允许所处理的个人数据相对于所声明的处理目的具有冗余性。</p>
      <p>5.6. 处理个人数据时，应保障个人数据的准确性、充分性，并在必要情况下保障其相对于处理目的的时效性。运营者采取必要措施及／或保障采取相应措施，以删除或澄清不完整或不准确的数据。</p>
      <p>5.7. 个人数据以可识别个人数据主体的形式存储的期限，不得长于个人数据处理目的所需，除非个人数据的存储期限由联邦法律，或由个人数据主体作为一方、受益人或担保人的合同所规定。所处理的个人数据在达成处理目的后，或在实现该等目的的必要性丧失时，予以销毁或去标识化，联邦法律另有规定的除外。</p>

      <h2>6. 个人数据处理目的</h2>
      <table>
        <thead>
          <tr>
            <th>处理目的</th>
            <th>个人数据</th>
            <th>法律依据</th>
            <th>个人数据处理方式</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>向用户提供对网站所含服务、信息及／或材料的访问</td>
            <td>电子邮箱地址、照片</td>
            <td>运营者与个人数据主体之间订立的合同；对主体许可传播的个人数据的处理</td>
            <td>个人数据的收集、记录、系统化、积累、存储、销毁与去标识化；向电子邮箱发送信息邮件；个人数据的传输</td>
          </tr>
        </tbody>
      </table>

      <h2>7. 个人数据处理条件</h2>
      <p>7.1. 个人数据处理在个人数据主体同意处理其个人数据的前提下进行。</p>
      <p>7.2. 为实现俄罗斯联邦国际条约或法律所规定的目的，以及为行使俄罗斯联邦法律赋予运营者的职能、权限与义务，个人数据处理是必需的。</p>
      <p>7.3. 为实施司法、执行司法文书或依据俄罗斯联邦执行程序法应予执行的其他机关或公职人员的文书，个人数据处理是必需的。</p>
      <p>7.4. 为履行以个人数据主体为一方、受益人或担保人的合同，以及为依个人数据主体的动议订立合同，或订立个人数据主体将成为受益人或担保人的合同，个人数据处理是必需的。</p>
      <p>7.5. 为实现运营者或第三方的权利与合法利益，或为达成具有社会意义的目的，在不侵犯个人数据主体权利与自由的前提下，个人数据处理是必需的。</p>
      <p>7.6. 对由个人数据主体本人或应其请求向不特定范围的人提供访问权限的个人数据进行处理（下称公开可得的个人数据）。</p>
      <p>7.7. 对依据联邦法律应予公布或强制披露的个人数据进行处理。</p>

      <h2>8. 个人数据的收集、存储、传输及其他处理方式的程序</h2>
      <p>运营者所处理个人数据的安全，通过实施为全面遵守个人数据保护领域现行法律要求所必需的法律、组织与技术措施予以保障。</p>
      <p>8.1. 运营者保障个人数据的安全，并采取一切可能措施排除未经授权者对个人数据的访问。</p>
      <p>8.2. 用户的个人数据不会传输给第三方，但下列情形除外：依据现行法律的要求；个人数据主体已同意为履行民事法律合同而向第三方传输数据；以及在本政策第 8.5 条和第 8.10 条规定的范围内向基础设施与测量服务提供商传输匿名技术信息。</p>
      <p>8.3. 如发现个人数据存在不准确之处，用户可自行更新，方式为向运营者电子邮箱 support@infernal-dash.xyz 发送标注“个人数据更新”的通知。</p>
      <p>8.4. 个人数据处理期限由收集个人数据所依据目的的达成情况确定，合同或现行法律另有规定期限的除外。用户可随时撤回其个人数据处理同意，方式为通过电子邮件向运营者电子邮箱 support@infernal-dash.xyz 发送标注“撤回个人数据处理同意”的通知。</p>
      <p>8.5. 由第三方服务收集的全部信息，包括支付系统、通信工具及其他服务提供商，均由上述主体（运营者）依据其用户协议与隐私政策存储与处理。运营者不对第三方的行为承担责任，包括本条所述服务提供商的行为。</p>
      <p>8.6. 在俄罗斯联邦法律确定的国家、社会及其他公共利益情形下处理个人数据时，个人数据主体就许可传播的个人数据所设定的传输禁止（提供访问除外），以及处理禁止或处理条件（获取访问除外），不予适用。</p>
      <p>8.7. 运营者在处理个人数据时保障个人数据的保密性。</p>
      <p>8.8. 运营者以可识别个人数据主体的形式存储个人数据的期限，不长于个人数据处理目的所需，除非个人数据存储期限由联邦法律，或由个人数据主体作为一方、受益人或担保人的合同所规定。</p>
      <p>8.9. 停止个人数据处理的条件可以是：达成个人数据处理目的、个人数据主体同意的有效期届满、个人数据主体撤回同意或提出停止处理个人数据的要求，以及发现存在非法的个人数据处理。</p>
      <p>8.10. 本网站使用 <strong>Vercel Web Analytics</strong> 与 <strong>Vercel Speed Insights</strong>（Vercel Inc.，美国）统计访问量并测量页面加载速度。上述服务<strong>不使用 Cookie</strong>，也不会为访问者分配可跨网站或跨会话追踪的标识符。所处理的均为匿名技术信息：页面地址、来源、设备与浏览器类型、国家，以及性能指标（渲染时间、响应速度、布局稳定性）。这些信息无法识别具体用户，也不会与账户数据合并。处理的法律依据是运营者在保障网站可用性与性能方面的正当利益。Vercel Inc. 一方的处理条件由该方自身政策确定；本政策第 8.5 条适用于此类传输。</p>

      <h2>9. 运营者对所获个人数据实施的行为清单</h2>
      <p>9.1. 运营者实施个人数据的收集、记录、系统化、积累、存储、澄清（更新、修改）、提取、使用、传输（传播、提供、访问）、去标识化、封锁、删除与销毁。</p>
      <p>9.2. 运营者实施个人数据的自动化处理，可伴随或不伴随通过信息电信网络接收及／或传输所获信息。</p>

      <h2>10. 个人数据的跨境传输</h2>
      <p>10.1. 在开展个人数据跨境传输活动之前，运营者有义务就其拟实施个人数据跨境传输的意向通知个人数据主体权利保护主管机关（该通知与拟实施个人数据处理的通知分别发送）。</p>
      <p>10.2. 在提交上述通知之前，运营者有义务从拟进行个人数据跨境传输的外国国家机关、外国自然人、外国法人处获取相应信息。</p>
      {crossBorderClause.zh}

      <h2>11. 个人数据的保密性</h2>
      <p>运营者及其他获得个人数据访问权限的人，有义务未经个人数据主体同意不向第三方披露、不传播个人数据，联邦法律另有规定的除外。</p>

      <h2>12. 最终条款</h2>
      <p>12.1. 用户可通过电子邮件 support@infernal-dash.xyz 联系运营者，就其关心的个人数据处理问题获得任何说明。</p>
      <p>12.2. 运营者个人数据处理政策的任何变更均将在本文件中体现。本政策无限期有效，直至被新版本取代。</p>
      <p>12.3. 本政策的现行版本可在互联网地址 https://infernal-dash.vercel.app/privacy 免费获取。</p>
      {finalClauses.zh}
    </>
  ),
};
