const Icon = ({ children, size = 16, color = 'currentColor' }) => <span aria-hidden="true" style={{ color, display: 'inline-flex', fontSize: size, lineHeight: 1 }}>{children}</span>
export const Trophy = (props) => <Icon {...props}>🏆</Icon>
export const Calendar = (props) => <Icon {...props}>▣</Icon>
export const Users = (props) => <Icon {...props}>♚</Icon>
export const Target = (props) => <Icon {...props}>◎</Icon>
export const Award = (props) => <Icon {...props}>★</Icon>
export const TrendingUp = (props) => <Icon {...props}>↗</Icon>
