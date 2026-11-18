-- Actividad 5 - Tablas propias de la plataforma Campus (MySQL / MariaDB): cuentas, pagos y reservas
--
-- Las cuentas son datos transaccionales: van en MySQL junto a Estudiante y Profesor.
-- La contraseña NUNCA se guarda: solo su hash (scrypt/pbkdf2 de Werkzeug).
--
-- Roles:
--   admin       -> solo entra por la terminal (admin.py)
--   estudiante  -> cuenta enlazada a un registro de Estudiante
--   profesor    -> cuenta enlazada a un registro de Profesor
--   general     -> público (aspirantes, acudientes): explora la oferta académica
--
-- No hace falta ejecutarlo a mano: admin.py y app.py lo aplican al iniciar
-- (CREATE TABLE IF NOT EXISTS). Se deja aquí como documentación del esquema.

USE Guia_8;

CREATE TABLE IF NOT EXISTS Usuario (
    IdUsuario     INT AUTO_INCREMENT PRIMARY KEY,
    Correo        VARCHAR(120) NOT NULL,
    Nombre        VARCHAR(80)  NOT NULL,
    ClaveHash     VARCHAR(255) NOT NULL,
    Rol           ENUM('admin', 'estudiante', 'profesor', 'general') NOT NULL,
    IdEstudiante  INT NULL,
    IdProfesor    INT NULL,
    Activo        TINYINT(1)   NOT NULL DEFAULT 1,
    Creado        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UltimoAcceso  DATETIME     NULL,
    CONSTRAINT uq_usuario_correo     UNIQUE (Correo),
    CONSTRAINT uq_usuario_estudiante UNIQUE (IdEstudiante),
    CONSTRAINT uq_usuario_profesor   UNIQUE (IdProfesor),
    CONSTRAINT fk_usuario_estudiante FOREIGN KEY (IdEstudiante) REFERENCES Estudiante (IdEstudiante) ON DELETE CASCADE,
    CONSTRAINT fk_usuario_profesor   FOREIGN KEY (IdProfesor)   REFERENCES Profesor (IdProfesor)   ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Pagos de matrícula (pasarela SIMULADA: proyecto académico, no se procesan pagos reales).
CREATE TABLE IF NOT EXISTS Pago (
    IdPago        INT AUTO_INCREMENT PRIMARY KEY,
    IdEstudiante  INT          NOT NULL,
    Periodo       VARCHAR(20)  NOT NULL,
    Valor         INT          NOT NULL,
    Metodo        ENUM('PSE', 'Tarjeta', 'Efectivo') NOT NULL,
    Banco         VARCHAR(60)  NULL,
    Referencia    VARCHAR(30)  NOT NULL,
    Estado        ENUM('Aprobado', 'Rechazado') NOT NULL DEFAULT 'Aprobado',
    Fecha         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pago_referencia UNIQUE (Referencia),
    CONSTRAINT fk_pago_estudiante FOREIGN KEY (IdEstudiante) REFERENCES Estudiante (IdEstudiante) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Reservas de laboratorio. La restricción UNIQUE impide que dos personas reserven
-- el mismo laboratorio en la misma fecha y franja, incluso si lo intentan a la vez.
CREATE TABLE IF NOT EXISTS ReservaLaboratorio (
    IdReserva     INT AUTO_INCREMENT PRIMARY KEY,
    IdUsuario     INT          NOT NULL,
    Laboratorio   VARCHAR(40)  NOT NULL,
    Fecha         DATE         NOT NULL,
    Franja        VARCHAR(11)  NOT NULL,
    Motivo        VARCHAR(120) NOT NULL,
    Creado        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_reserva_franja UNIQUE (Laboratorio, Fecha, Franja),
    CONSTRAINT fk_reserva_usuario FOREIGN KEY (IdUsuario) REFERENCES Usuario (IdUsuario) ON DELETE CASCADE
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
