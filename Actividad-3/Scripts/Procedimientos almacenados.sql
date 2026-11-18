-- Active: 1792886422015@@127.0.0.1@3306@Guia_8
USE Guia_8;

-- 1. Agregar columnas necesarias si no existen en Estudiante y Matricula
SET
    @existe_est = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'Estudiante'
            AND COLUMN_NAME = 'Promedio'
    );

SET
    @sql_est = IF(
        @existe_est = 0,
        'ALTER TABLE Estudiante
         ADD COLUMN Promedio DECIMAL(3,2) NULL,
         ADD COLUMN EstadoAcademico VARCHAR(20) NOT NULL DEFAULT ''Sin calificar''',
        'SELECT ''Columnas en Estudiante ya existen'' AS Aviso'
    );

PREPARE stmt1 FROM @sql_est;

EXECUTE stmt1;

DEALLOCATE PREPARE stmt1;

SET
    @existe_mat = (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE
            TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'Matricula'
            AND COLUMN_NAME = 'EstadoCurso'
    );

SET
    @sql_mat = IF(
        @existe_mat = 0,
        'ALTER TABLE Matricula
         ADD COLUMN EstadoCurso VARCHAR(20) NOT NULL DEFAULT ''Sin evaluar''',
        'SELECT ''Columna EstadoCurso ya existe'' AS Aviso'
    );

PREPARE stmt2 FROM @sql_mat;

EXECUTE stmt2;

DEALLOCATE PREPARE stmt2;

-- 2. Procedimiento 1: sp_registrar_matricula
DROP PROCEDURE IF EXISTS sp_registrar_matricula;

DELIMITER //

CREATE PROCEDURE sp_registrar_matricula(
    IN  p_IdEstudiante INT,
    IN  p_IdGrupo      INT,
    OUT p_Mensaje      VARCHAR(200)
)
BEGIN
    DECLARE v_NuevoId   INT;
    DECLARE v_Cupo      INT;
    DECLARE v_Inscritos INT;
    DECLARE v_Creditos  INT;
    DECLARE v_ErrorSQL  VARCHAR(200);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 v_ErrorSQL = MESSAGE_TEXT;
        ROLLBACK;
        SET p_Mensaje = CONCAT('ERROR SQL: ', v_ErrorSQL);
    END;

    IF p_IdEstudiante IS NULL OR p_IdGrupo IS NULL THEN
        SET p_Mensaje = 'ERROR: estudiante y curso son obligatorios';
    ELSEIF NOT EXISTS (SELECT 1 FROM Estudiante WHERE IdEstudiante = p_IdEstudiante) THEN
        SET p_Mensaje = CONCAT('ERROR: el estudiante ', p_IdEstudiante, ' no existe');
    ELSEIF NOT EXISTS (SELECT 1 FROM Grupo WHERE IdGrupo = p_IdGrupo) THEN
        SET p_Mensaje = CONCAT('ERROR: el curso ', p_IdGrupo, ' no existe');
    ELSEIF EXISTS (SELECT 1 FROM Matricula WHERE IdEstudiante = p_IdEstudiante AND IdGrupo = p_IdGrupo) THEN
        SET p_Mensaje = 'ERROR: el estudiante ya esta matriculado en ese curso';
    ELSE
        START TRANSACTION;
        SELECT Cupo INTO v_Cupo FROM Grupo WHERE IdGrupo = p_IdGrupo FOR UPDATE;
        SELECT COUNT(*) INTO v_Inscritos FROM Matricula WHERE IdGrupo = p_IdGrupo;

        IF v_Cupo IS NOT NULL AND v_Inscritos >= v_Cupo THEN
            ROLLBACK;
            SET p_Mensaje = CONCAT('ERROR: el curso ', p_IdGrupo, ' no tiene cupo (', v_Inscritos, '/', v_Cupo, ')');
        ELSE
            SELECT COALESCE(MAX(IdMatricula), 0) + 1 INTO v_NuevoId FROM Matricula;
            SELECT m.CreditosMateria INTO v_Creditos
            FROM Grupo g JOIN Materia m ON m.IdMateria = g.IdMateria
            WHERE g.IdGrupo = p_IdGrupo;

            INSERT INTO Matricula (IdMatricula, IdEstudiante, IdGrupo, FechaMatricula, NotaFinal, ValorMatricula)
            VALUES (v_NuevoId, p_IdEstudiante, p_IdGrupo, CURDATE(), NULL, 200000 + v_Creditos * 250000);

            COMMIT;
            SET p_Mensaje = CONCAT('EXITO: matricula ', v_NuevoId, ' registrada para el estudiante ', p_IdEstudiante, ' en el curso ', p_IdGrupo);
        END IF;
    END IF;
END //

DELIMITER ;

-- 3. Procedimiento 2: sp_calcular_promedio
DROP PROCEDURE IF EXISTS sp_calcular_promedio;

DELIMITER //

CREATE PROCEDURE sp_calcular_promedio(
    IN  p_IdEstudiante  INT,
    OUT p_Promedio      DECIMAL(3,2),
    OUT p_Clasificacion VARCHAR(40)
)
BEGIN
    DECLARE v_ErrorSQL VARCHAR(200);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 v_ErrorSQL = MESSAGE_TEXT;
        ROLLBACK;
        SET p_Promedio = NULL;
        SET p_Clasificacion = LEFT(CONCAT('ERROR SQL: ', v_ErrorSQL), 40);
    END;

    IF NOT EXISTS (SELECT 1 FROM Estudiante WHERE IdEstudiante = p_IdEstudiante) THEN
        SET p_Promedio = NULL;
        SET p_Clasificacion = 'ERROR: el estudiante no existe';
    ELSE
        START TRANSACTION;

        SELECT ROUND(AVG(NotaFinal), 2) INTO p_Promedio
        FROM Matricula
        WHERE IdEstudiante = p_IdEstudiante;

        SET p_Clasificacion = CASE
            WHEN p_Promedio IS NULL THEN 'Sin calificar'
            WHEN p_Promedio >= 4.5  THEN 'Excelente'
            WHEN p_Promedio >= 4.0  THEN 'Bueno'
            WHEN p_Promedio >= 3.0  THEN 'Aprobado'
            ELSE                         'Reprobado'
        END;

        UPDATE Estudiante
        SET Promedio        = p_Promedio,
            EstadoAcademico = p_Clasificacion
        WHERE IdEstudiante = p_IdEstudiante;

        COMMIT;
    END IF;
END //

DELIMITER ;

-- 4. Procedimiento 3: sp_actualizar_estado_curso
DROP PROCEDURE IF EXISTS sp_actualizar_estado_curso;

DELIMITER //

CREATE PROCEDURE sp_actualizar_estado_curso(
    IN  p_IdGrupo  INT,
    OUT p_Mensaje  VARCHAR(200)
)
BEGIN
    DECLARE v_IdMatricula INT;
    DECLARE v_Nota        DECIMAL(3,2);
    DECLARE v_Estado      VARCHAR(20);
    DECLARE v_Fin         BOOLEAN DEFAULT FALSE;
    DECLARE v_Aprobados   INT DEFAULT 0;
    DECLARE v_Reprobados  INT DEFAULT 0;
    DECLARE v_Pendientes  INT DEFAULT 0;
    DECLARE v_ErrorSQL    VARCHAR(200);

    DECLARE cur_matriculas CURSOR FOR
        SELECT IdMatricula, NotaFinal FROM Matricula WHERE IdGrupo = p_IdGrupo;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_Fin = TRUE;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        GET DIAGNOSTICS CONDITION 1 v_ErrorSQL = MESSAGE_TEXT;
        ROLLBACK;
        SET p_Mensaje = CONCAT('ERROR SQL: ', v_ErrorSQL);
    END;

    IF p_IdGrupo IS NULL THEN
        SET p_Mensaje = 'ERROR: el curso es obligatorio';
    ELSEIF NOT EXISTS (SELECT 1 FROM Grupo WHERE IdGrupo = p_IdGrupo) THEN
        SET p_Mensaje = CONCAT('ERROR: el curso ', p_IdGrupo, ' no existe');
    ELSE
        START TRANSACTION;
        OPEN cur_matriculas;

        bucle: LOOP
            FETCH cur_matriculas INTO v_IdMatricula, v_Nota;
            IF v_Fin THEN
                LEAVE bucle;
            END IF;

            IF v_Nota IS NULL THEN
                SET v_Estado = 'Pendiente';
                SET v_Pendientes = v_Pendientes + 1;
            ELSEIF v_Nota >= 3.0 THEN
                SET v_Estado = 'Aprobado';
                SET v_Aprobados = v_Aprobados + 1;
            ELSE
                SET v_Estado = 'Reprobado';
                SET v_Reprobados = v_Reprobados + 1;
            END IF;

            UPDATE Matricula SET EstadoCurso = v_Estado WHERE IdMatricula = v_IdMatricula;
        END LOOP bucle;

        CLOSE cur_matriculas;
        COMMIT;

        SET p_Mensaje = CONCAT('EXITO: curso ', p_IdGrupo, ' -> ',
                               v_Aprobados + v_Reprobados + v_Pendientes, ' matriculas (',
                               v_Aprobados, ' aprobadas, ', v_Reprobados, ' reprobadas, ',
                               v_Pendientes, ' pendientes)');
    END IF;
END //

DELIMITER ;