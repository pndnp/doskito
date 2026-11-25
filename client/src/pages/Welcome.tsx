import { OpenBoardForm, Logo, useCreateBoard } from '../components/Common';

export function Welcome() {
  const createBoard = useCreateBoard();
  return (
    <main className="page welcome">
      <Logo />
      <div className="welcome-content">
        <div className="welcome-art" aria-hidden="true">
          {['coral', 'yellow', 'mint'].map((color, index) => (
            <div className={`welcome-card welcome-card-${index + 1}`} key={color}>
              <div className="welcome-card-heading">
                <span className={`welcome-card-title welcome-card-title-${color}`} />
                {color === 'mint' && (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="12" fill="var(--mint)" />
                    <path
                      d="M7 12.5l3.2 3.2L17 9"
                      stroke="var(--on-accent)"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="welcome-card-line" />
              <span className="welcome-card-line welcome-card-line-short" />
              <span className="welcome-card-track">
                <span className={`welcome-card-fill welcome-card-title-${color}`} />
              </span>
            </div>
          ))}
        </div>
        <h1>Создайте доску</h1>
        <p className="welcome-description">
          Пишите задачи как в заметках, а ИИ разберёт их на подзадачи со сроками. Регистрация не
          нужна: доступ к доске по ссылке.
        </p>
        <button
          className="button button-primary welcome-cta"
          disabled={createBoard.isPending}
          onClick={() => createBoard.mutate()}
        >
          {createBoard.isPending ? 'Создаём…' : 'Создать доску'}
        </button>
        <OpenBoardForm variant="welcome" />
        <div className="welcome-pills">
          <span className="pill pill-mint">Без регистрации</span>
          <span className="pill pill-yellow">ИИ разбирает задачи</span>
          <span className="pill pill-coral">Совместная работа по ссылке</span>
        </div>
      </div>
    </main>
  );
}
